# Fake AWS Cognito service

A _permissive_ simulation of [AWS Cognito](https://aws.amazon.com/fr/cognito/)
for local development. We want to support only the core functionality we use and
implement only the logic needed to pass our tests. We are aiming for simplicity
and maintainability.

## Configuration

Always run on port 9329

```env
# Token issuer
COGNITO_ENDPOINT=http://host.docker.internal:9329
```

## Docker compose

```yml
services:
    cognito:
        build: https://github.com/TheSpringProgram/fake-cognito
        ports: ['9329:9329']
        env_file: .env
```
