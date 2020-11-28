# About

## Before first start

this project references the hbbft-posdao-contracts projects and needs to be in a parallel directory to the hbbft-posdao-contracts projects.
retrieve and build the contracts:  `npm run build-contracts && npm run build`

## running the UI

This is a basic Dapp for interacting with the POSDAO contracts of a connected chain.

`cd posdao-test-setup && npm run all-ui-light` starts a dev chain configured for native staking. Takes a few minutes to init posdao.  
Once initialized, use `npm run stop-test-setup` and `npm run upgrade-start-test-setup` to stop/start the dev network.

See `.env.example` for supported/needed env variables.

Start with `npm run start`.
