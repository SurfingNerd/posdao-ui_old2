# About

This is a basic Dapp for interacting with the POSDAO contracts of a connected chain.

`npm run all-ui-light` starts a dev chain configured for native staking. Takes a few minutes to init.

then get the validatorset contract address from spec file and start the app with 
`REACT_APP_VALIDATORSET_CONTRACT=0x40D147F0F3e9A46315614BF40DcFca66c01eA3F7 BROWSER=none npm run start`

```
areStakeAndWithdrawAllowed()
addPool(0, miningAddress)
removeMyPool()
withdraw(poolAddr, amount)
```


## console

accs = await web3.eth.getAccounts()
pools = await st.getPools()
web3.eth.personal.unlockAccount(accs[1], "testnetpoa")


```
ltruffle test test/StakingAuRaNative.js test/mockContracts/BlockRewardAuRaCoinsMock.sol test/mockContracts/ValidatorSetAuRaMock.sol test/mockContracts/StakingAuRaCoinsMock.sol --network test
```
