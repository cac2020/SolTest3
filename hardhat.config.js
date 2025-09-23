require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require('@openzeppelin/hardhat-upgrades');
require("dotenv").config();

module.exports = {
  solidity: "0.8.27",
  settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
  },
  //账户索引
  namedAccounts: {
    deployer: 0,
    user1: 1,
    user2: 2,
  },
  networks: {
    hardhat: {
      //在配置文件中显式关闭硬分叉状态持久化（适用于所有网络）
      persist: false,
    },
    // 本地节点（需先运行 npx hardhat node）
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    },
    // Sepolia 测试网（通过 Infura 接入）
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY].filter(Boolean), // 过滤逻辑，作用是自动移除数组中的 “无效值”（如 undefined、null、空字符串等），确保最终传入 Hardhat 配置的 accounts 是一个 “干净” 的数组。
      chainId: 11155111 
    }
  },
};
