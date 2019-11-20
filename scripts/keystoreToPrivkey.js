const Web3Eth = require('web3-eth');
const fs = require('fs');

function debug(msg) {
    if(process.env.DEBUG) {
        console.log(msg);
    }
}

const keystoreFile = process.argv[2];
const passwordFile = process.argv[3];

debug(`keystore file: ${keystoreFile}, password file: ${passwordFile}`);

async function main() {
    const eth = new Web3Eth();

    try {
        const keystore = fs.readFileSync(keystoreFile, 'utf-8');
        const password = (fs.readFileSync(passwordFile, 'utf-8')).trim();
        debug(`password: ${password}`);

        const acc = eth.accounts.decrypt(keystore, password);

        console.log(JSON.stringify(acc, null, 2));
    } catch(e) {
        console.log(`failed with ${e}`);
    }
}

main();
