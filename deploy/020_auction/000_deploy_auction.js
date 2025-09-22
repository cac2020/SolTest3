const { deployments } = require("hardhat");

module.exports = async function ({ deployments, getNamedAccounts }) {
  // 从 deployments 对象中解构出 save 方法，用于保存部署信息
  const { deploy } = deployments;
  // 获取命名账户中的 deployer 账户，用于执行部署操作
  const { deployer } = await getNamedAccounts();

  // 获取依赖的 Library 和普通合约地址
  const PriceConverter = await deployments.get("PriceConverter"); // 依赖步骤1的部署结果

  // 部署模板合约（不可升级，普通部署,作为克隆体的模板  不需要初始化）
  const auctionDeployment = await deploy(
    "Auction", //要部署的合约名称  全局唯一
    {
      from: deployer, // 将执行交易的地址（或私钥）。你可以使用`getNamedAccounts`通过名称获取所需地址。
      contract: "Auction", //这是一个可选字段。如果未指定，默认值为与第一个参数同名的合约
      args: [], // 构造函数的参数列表（若是代理合约，则为升级函数的参数）
      log: true, // 果为true，将记录部署结果（交易哈希、地址和使用的gas）
      skipIfAlreadyDeployed: true, // 如果设为true，即使同名合约的部署内容不同，也不会尝试重新部署 ,依赖 “本地部署记录” 和 “链上状态” 的双重校验,skipIfAlreadyDeployed 不是 “强制重新部署” 的唯一条件
      //linkedData?: any; // 允许将任何JSON数据与部署关联。例如，对默克尔树数据很有用
      libraries: { 
        // 允许将库与部署的合约关联
        PriceConverter: PriceConverter.address,
      },
      //proxy?: boolean | string | ProxyOptions; // 此选项允许将你的合约视为代理（详见下文）

      // 以下是一些常见的交易选项：
      //gasLimit?: string | number | BigNumber;
      //gasPrice?: string | BigNumber;
      //value?: string | BigNumber;
      //nonce?: string | number | BigNumber;

      //estimatedGasLimit?: string | number | BigNumber; // 为加快估算速度，可以提供一个上限gasLimit
      //estimateGasExtra?: string | number | BigNumber; // 此选项允许在估算值基础上增加一个gas缓冲量

      //autoMine?: boolean; // 这会强制执行evm_mine。在允许指定区块延迟的测试网络（如ganache）上，这对加快部署很有用。此选项通过强制挖矿来跳过延迟。
      //deterministicDeployment? boolean | string; // 如果为true，将根据字节码和构造函数参数在确定性地址部署合约。该地址在所有网络上都相同。这会使用create2操作码；如果是字符串，该字符串将用作salt。
      //waitConfirmations?: number; // 交易被包含在区块链中后，需要等待的确认次数
    }
  );

  //console.log("模板合约 Auction 部署地址：", auctionDeployment.address);
};

// 声明依赖：确保先部署 PriceConverter 和 FeeManager
module.exports.dependencies = ["PriceConverter", "FeeManager"];
// 标签用于分组部署 指定为template模板标签
module.exports.tags = ["Auction", "template","all"];
