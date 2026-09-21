const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const PORTAL = '0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0';
const RPC_URL = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
const DATA_FILE = path.join(__dirname, '..', 'data', 'launches.json');
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const provider = new ethers.JsonRpcProvider(RPC_URL, 56, { staticNetwork: true, batchMaxCount: 1 });
const TOKEN_ABI = ['function name() view returns(string)', 'function symbol() view returns(string)'];

function readLaunches() {
  try {
    const value = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeLaunches(items) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const temporary = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, DATA_FILE);
}

function publicLaunch(item) {
  return {
    name: item.name,
    symbol: item.symbol,
    address: item.address,
    creator: item.creator,
    txHash: item.txHash,
    createdAt: item.createdAt,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const creator = String(req.query?.creator || '').toLowerCase();
    let items = readLaunches();
    if (creator) {
      if (!ADDRESS_RE.test(creator)) return res.status(400).json({ error: 'Invalid creator address.' });
      items = items.filter(item => item.creator.toLowerCase() === creator);
    }
    return res.status(200).json({ launches: items.slice(0, 250).map(publicLaunch) });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const address = String(req.body?.address || '');
  const creator = String(req.body?.creator || '');
  const txHash = String(req.body?.txHash || '');
  if (!ADDRESS_RE.test(address) || !ADDRESS_RE.test(creator) || !HASH_RE.test(txHash)) {
    return res.status(400).json({ error: 'A valid token, creator, and transaction hash are required.' });
  }

  try {
    const [receipt, transaction, code] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getTransaction(txHash),
      provider.getCode(address),
    ]);
    if (!receipt || receipt.status !== 1 || !transaction) {
      return res.status(400).json({ error: 'The launch transaction is not confirmed.' });
    }
    if (String(transaction.to || '').toLowerCase() !== PORTAL || String(transaction.from || '').toLowerCase() !== creator.toLowerCase()) {
      return res.status(400).json({ error: 'Transaction does not match this creator and Flap V7 Portal.' });
    }
    const addressNeedle = address.slice(2).toLowerCase();
    const receiptContainsToken = receipt.logs.some(log =>
      String(log.address || '').toLowerCase() === address.toLowerCase() ||
      String(log.data || '').toLowerCase().includes(addressNeedle) ||
      (log.topics || []).some(topic => String(topic).toLowerCase().includes(addressNeedle))
    );
    if (code === '0x' || !receiptContainsToken) {
      return res.status(400).json({ error: 'Token address was not found in the confirmed launch receipt.' });
    }

    const token = new ethers.Contract(address, TOKEN_ABI, provider);
    const [name, symbol, block] = await Promise.all([token.name(), token.symbol(), provider.getBlock(receipt.blockNumber)]);
    const item = {
      name: String(name).slice(0, 80),
      symbol: String(symbol).slice(0, 24),
      address: ethers.getAddress(address),
      creator: ethers.getAddress(creator),
      txHash,
      createdAt: block?.timestamp ? Number(block.timestamp) * 1000 : Date.now(),
    };
    const items = readLaunches();
    const existing = items.find(entry => entry.address.toLowerCase() === address.toLowerCase());
    if (!existing) writeLaunches([item, ...items].slice(0, 500));
    return res.status(existing ? 200 : 201).json({ launch: publicLaunch(existing || item) });
  } catch (error) {
    return res.status(502).json({ error: 'Unable to verify this launch on BNB Chain.', detail: error.shortMessage || error.message });
  }
};
