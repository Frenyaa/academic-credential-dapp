import { useState, useEffect } from "react";
import { ethers, BrowserProvider, Contract } from "ethers";
import ContractABI from "../CredentialRegistry.json";
import ContractAddress from "../contract-address.json";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function useContract() {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [account, setAccount] = useState<string>("");
  const [isIssuer, setIsIssuer] = useState<boolean>(false);

  const connect = async () => {
    if (!window.ethereum) {
      alert("Vui lòng cài MetaMask!");
      return;
    }
    const _provider = new ethers.BrowserProvider(window.ethereum);

    // Diagnostic: Check Network
    const network = await _provider.getNetwork();
    const chainId = network.chainId;
    console.log("Connect attempt - Network Chain ID:", chainId.toString());

    // Hardhat defaults to 31337. Some MetaMask setups use 1337 for localhost.
    if (chainId !== 31337n && chainId !== 1337n) {
      const msg = `Lỗi mạng: Bạn đang hiển thị Chain ID ${chainId}. Vui lòng chuyển MetaMask sang mạng Localhost (Chain ID: 31337).`;
      alert(msg);
      console.error(msg);
      return; // STOP HERE to avoid BAD_DATA error
    }

    await _provider.send("eth_requestAccounts", []);
    const signer = await _provider.getSigner();
    const addr = await signer.getAddress();

    const contractAddress = ContractAddress.CredentialRegistry;
    console.log("Target Contract Address:", contractAddress);

    // Diagnostic: Check if code exists at address
    const code = await _provider.getCode(contractAddress);
    if (code === "0x") {
      const msg = "LỖI: Không tìm thấy contract code tại địa chỉ này. Hãy đảm bảo bạn đã deploy contract và MetaMask đang ở đúng mạng Localhost.";
      console.error(msg, "Address:", contractAddress);
      alert(msg);
      return; // STOP HERE
    }

    const _contract = new ethers.Contract(
      contractAddress,
      ContractABI.abi,
      signer
    );

    try {
      const _isIssuer = await _contract.authorizedIssuers(addr);
      setProvider(_provider);
      setContract(_contract);
      setAccount(addr);
      setIsIssuer(_isIssuer);
    } catch (err: any) {
      console.error("Lỗi khi gọi authorizedIssuers:", err);
      alert("Lỗi kết nối contract: " + (err.reason || err.message));
    }
  };
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) return;

      const newAccount = accounts[0];
      console.log("Switched account:", newAccount);

      const _provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await _provider.getSigner(newAccount);

      const contractAddress = ContractAddress.CredentialRegistry;
      const code = await _provider.getCode(contractAddress);
      if (code === "0x") {
        console.error("Không tìm thấy contract khi switch account");
        return;
      }
      const _contract = new ethers.Contract(
        contractAddress,
        ContractABI.abi,
        signer
      );

      try {
        const _isIssuer = await _contract.authorizedIssuers(newAccount);

        // update lại toàn bộ state
        setProvider(_provider);
        setContract(_contract);
        setAccount(newAccount);
        setIsIssuer(_isIssuer);

      } catch (err) {
        console.error("Lỗi khi switch account:", err);
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, []);
  return { provider, contract, account, isIssuer, connect };
}