import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import Context from './model/Context';

it('renders without crashing', () => {
  const div = document.createElement('div');

  const wsUrl = new URL(process.env.REACT_APP_WS_URL || 'ws://localhost:9541');
  const validatorSetContractAddress = process.env.REACT_APP_VALIDATORSET_CONTRACT || '0x1000000000000000000000000000000000000001';

  Context.initialize(wsUrl, validatorSetContractAddress).then((ctx) => {
    ReactDOM.render(<App context={ctx} />, div);
    ReactDOM.unmountComponentAtNode(div);
  });
});
