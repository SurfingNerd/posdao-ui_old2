import React from 'react';
import ReactDOM from 'react-dom';
import Context from './model/Context';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

const rpcUrl = new URL(process.env.RPC_URL ||'ws://localhost:9541');
const validatorSetContractAddress = process.env.REACT_APP_VALIDATORSET_CONTRACT || '0x1000000000000000000000000000000000000001';
//const privKey = process.env.REACT_APP_PRIVKEY;

let context: Context;

ReactDOM.render(
    <h1>loading...</h1>,
    document.getElementById('root'),
)

// debug
declare let window: any;
Context.initialize(rpcUrl, validatorSetContractAddress).then(ctx => {
    context = ctx;
    window.context = context;

    ReactDOM.render(
        <App context={context} />,
        document.getElementById('root'),
    );
});


// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
