import React from 'react';
import ReactDOM from 'react-dom';
import Context from './model/Context';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

const rpcUrl = new URL(process.env.RPC_URL ||'ws://localhost:9541');
const validatorSetContractAddress = process.env.REACT_APP_VALIDATORSET_CONTRACT || '0x1000000000000000000000000000000000000001';
const privKey = process.env.REACT_APP_PRIVKEY;
const context = new Context(rpcUrl, validatorSetContractAddress, privKey);

// debug
declare let window: any;
window.context = context;

ReactDOM.render(
    <App context={context} />,
    document.getElementById('root'),
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
