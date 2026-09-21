(() => {
  const BSC_HEX = '0x38';
  const button = document.getElementById('wallet-btn');
  if (!button) return;
  const short = value => `${value.slice(0, 6)}…${value.slice(-4)}`;
  button.addEventListener('click', async () => {
    if (!window.ethereum) {
      button.textContent = 'Install wallet';
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== BSC_HEX) {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_HEX }] });
      }
      button.textContent = short(accounts[0]);
      document.dispatchEvent(new CustomEvent('zfun:wallet', { detail: { address: accounts[0] } }));
    } catch (error) {
      button.textContent = error?.code === 4001 ? 'Connection rejected' : 'Connect Wallet';
    }
  });
})();
