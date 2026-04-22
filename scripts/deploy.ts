import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying với địa chỉ:", deployer.address);

  const Factory = await ethers.getContractFactory("CredentialRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("CredentialRegistry deployed tại:", address);

  // Lưu địa chỉ contract để frontend dùng
  const fs = require("fs");
  fs.writeFileSync(
    "./frontend/src/contract-address.json",
    JSON.stringify({ CredentialRegistry: address }, null, 2)
  );
  console.log("Đã lưu địa chỉ vào frontend/src/contract-address.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});