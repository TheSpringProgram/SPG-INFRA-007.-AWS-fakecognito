import { assertEquals } from 'https://deno.land/std@0.132.0/testing/asserts.ts';
import { Application } from 'https://deno.land/x/oak@v12.2.0/mod.ts';
import { create } from 'https://deno.land/x/djwt@v2.8/mod.ts';
import { StorageArea } from 'https://deno.land/x/kv_storage/sqlite.ts';
import 'https://deno.land/std@0.185.0/dotenv/load.ts';
import jwks from './jwks.json' assert { type: 'json' };

// Durable KV storage
const kv = new StorageArea();
// Load private RS256 key from jwks generate with https://mkjwk.org/
const privateKey = await window.crypto.subtle.importKey(
  'jwk',
  jwks.keys[0],
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign']
);
const iss = Deno.env.get('COGNITO_ENDPOINT');
const app = new Application();

// Generate tokens with necessary fields for our backend
// https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html
async function generateTokens(account, clientId) {
  const header = {
    alg: 'RS256',
    kid: 'local',
  };
  return {
    AccessToken: await create(header, { token_use: 'access', iss }, privateKey),
    IdToken: await create(
      header,
      { token_use: 'access', email: account.email, aud: clientId, iss },
      privateKey
    ),
    RefreshToken: await create(
      header,
      { email: account.email, iss },
      privateKey
    ),
  };
}

// Simulation of a part of AWS Cognito API
// https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/Welcome.html
async function CognitoAPI(action, body) {
  if (action == 'SignUp') {
    const account = {
      username: body.Username,
      password: body.Password,
      email: body.UserAttributes.find(it => it.Name == 'email').Value,
    };
    if (await kv.get(account.username)) {
      throw 'UsernameExistsException';
    }
    await kv.set(account.username, account);
    return {
      UserConfirmed: true,
    };
  } else if (action == 'ConfirmSignUp') {
    const account = await kv.get(body.Username);
    if (!account) {
      throw new Error('UserNotFoundException');
    }

    // We don't actually confirm anything for now
    return '';
  } else if (action == 'InitiateAuth') {
    assertEquals(body.AuthFlow, 'USER_SRP_AUTH');
    const account = await kv.get(body.AuthParameters.USERNAME);
    if (account == undefined) {
      throw 'UserNotFoundException';
    }
    return {
      ChallengeParameters: {
        USER_ID_FOR_SRP: account.username,
        SRP_B: (42).toString(16),
        SALT: (76).toString(16),
        SECRET_BLOCK: 'unused',
      },
    };
  } else if (action == 'RespondToAuthChallenge') {
    assertEquals(body.ChallengeName, 'PASSWORD_VERIFIER');
    const account = await kv.get(
      body.ChallengeResponses.USERNAME,
      body.ClientId
    );
    return {
      AuthenticationResult: await generateTokens(account),
    };
  }
}
app.use(async ctx => {
  const path = ctx.request.url.pathname;
  if (path == '/') {
    const action = ctx.request.headers
      .get('x-amz-target')
      .replace('AWSCognitoIdentityProviderService.', '');
    const body = await (await ctx.request.body({ type: 'json' })).value;

    try {
      const response = await CognitoAPI(action, body);
      if (response != undefined) {
        ctx.response.body = JSON.stringify(response);
        ctx.response.status = 200;
      } else {
        console.error(`Unsupported Cognito Action: ${action}`);
        ctx.response.status = 500;
      }
    } catch (error) {
      console.log(error);
      ctx.response.status = 400;
      ctx.response.body = JSON.stringify({
        code: error,
        name: error,
        message: error,
      });
    }
  } else if (path == '/.well-known/jwks.json') {
    ctx.response.body = JSON.stringify(jwks);
  }
  ctx.response.headers.set('Access-Control-Allow-Origin', '*');
});
console.log('Fake Cognito ready');
await app.listen({ port: 9329 });