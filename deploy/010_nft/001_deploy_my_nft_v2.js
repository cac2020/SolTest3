const { ethers, deployments, upgrades } = require("hardhat");
const  path  = require('path');
const  fs  = require('fs');

module.exports = async ({ getNamedAccounts, deployments }) => {
  //从 deployments 对象中解构出 save 和 get 方法 用于部署过程中的数据存储和获取操作
  const { save, get } = deployments;
  //获取命名账户中的部署者账户信息
  const { deployer } = await getNamedAccounts();

  // 获取MyNFTProxy合约实例
  const MyNFTProxy = await get("MyNFTProxy");
  // 从MyNFTProxy实例中提取合约地址
  const MyNFTProxyAddress = MyNFTProxy.address;
  //console.log("上次部署的 MyNFTProxy 地址：", MyNFTProxyAddress);

  // 获取MyNFTV2合约工厂实例，用于部署或升级合约
  const MyNFTV2 = await ethers.getContractFactory("MyNFTV2");
  // 使用upgradeProxy方法将现有实现合约升级到新的MyNFTV2合约实现
  // 参数1: MyNFTProxyAddress - 现有代理合约的地址
  // 参数2: MyNFTV2 - 新的合约实现工厂实例
  const proxy = await upgrades.upgradeProxy(MyNFTProxyAddress, MyNFTV2);
  // 获取升级后代理合约的地址  应该和原来的一致
  const proxyAddress = await proxy.getAddress();
  //console.log("本次更新的 MyNFTProxy 地址：", proxyAddress);
  const impleAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`MyNFTV2Proxy address: ${proxyAddress} \nMyNFTV2Implementation address: ${impleAddress}`);

  //保存实现合约部署信息
  const storePath = path.resolve(__dirname, "../.cache/MyNFTV2.json");
  fs.writeFileSync(storePath, JSON.stringify({
    proxyAddress,
    impleAddress,
    abi: MyNFTV2.interface.format("json"),
  }));

  //写入代理合约信息：将代理合约地址、实现合约地址和ABI接口信息写入deployments文件夹
  await save("MyNFTV2Proxy", {
    address: proxyAddress,
    abi: proxy.interface.format("json"),
  });
};

module.exports.dependencies = ["MyNFTProxy"];
//tags 是用于给部署脚本打 “标签” 的机制，方便通过标签筛选需要执行的脚本。
// 其中 all 是一个约定俗成的通用标签，作用是：标记 “该脚本属于项目需要部署的核心合约”，方便一次性部署所有带 all 标签的脚本。
//只需指定 --tags all，就能按顺序执行所有带 all 标签的脚本，无需逐个指定每个脚本的标签。
module.exports.tags = ["upgradeMyNFTV2","all"];
