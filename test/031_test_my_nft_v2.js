const { expect } = require("chai");
const { ethers, deployments, upgrades } = require("hardhat");

describe("MyNFTV2", function () {
  let myNFT;
  let owner, addr1;

  beforeEach(async function () {
    // 获取测试账户
    [owner, addr1] = await ethers.getSigners();
    initialOwner = owner.address;

    /**
     * 自动部署
     * fixture是 hardhat-deploy 插件提供的核心测试工具，用于在测试前自动执行部署脚本，快速初始化测试环境，避免在测试代码中重复编写合约部署逻辑。
     * 1）自动执行部署脚本：自动运行 deploy 目录下的部署脚本，将合约部署到测试网络（如 Hardhat 本地网络），无需在测试中手动调用 deploy 函数。
     * 2）缓存部署结果：首次调用 fixture 时执行部署，后续调用会直接复用缓存的部署结果（合约地址、ABI 等），大幅提升测试速度（尤其在多个测试用例共享部署状态时）。
     * 3）支持按标签过滤部署：可通过标签（tags）指定只执行特定部署脚本（例如只部署 token 相关合约，忽略其他脚本），灵活控制测试环境的初始化范围。
     *  await deployments.fixture(); // 无参时 执行所有部署脚本
     *  await deployments.fixture(["token"]); //按照tag标签过滤执行部署脚本
     */
    //fixture自动部署时不能对具体的合约设置参数  所以测试时一些初始测试数据要使用部署时预置的数据
    //依赖多个部署时都要加载进来
    await deployments.fixture(["deployMyNFT","upgradeMyNFTV2"]);
    //deployments.get("xxx") 返回的是一个包含合约地址和ABI等信息的部署对象，而不是可以直接调用方法的合约实例。
    const MyNFTV2Proxy = await deployments.get("MyNFTV2Proxy");
    //获取代理合约两种方法：
    //方法一：通过已知实现合约名称和代理合约地址获取合约实例 ：第一个参数是实现合约名称 可以从编译产物找到ABI，第二个参数是代理合约地址
    myNFT = await ethers.getContractAt("MyNFTV2", MyNFTV2Proxy.address);

    //方法二： attach
    //获取实现合约工厂对象
    //const FeeManager = await ethers.getContractFactory("FeeManager");
    //创建一个新的合约实例，该实例的所有方法调用都会发送到指定的 address，并使用当前合约工厂的 ABI 解析方法。
    //feeManager = FeeManager.attach(FeeManagerProxy.address);
  });

  describe("Deployment", async () => {
    it("应该允许所有者铸造NFT", async () => {
      const tokenURI = "https://example.com/token/0";
      const tokenId = await myNFT.safeMint(await addr1.getAddress(), tokenURI);
      //wait()方法确保交易被打包确认。
      await tokenId.wait();

      //safeMint 是一个交易，返回的是交易对象，不是直接的返回值。 不能直接对比
      //expect(tokenId).to.equal(0);
      //验证地址
      expect(await myNFT.ownerOf(0)).to.equal(addr1.address);
      // 验证tokenURI
      expect(await myNFT.tokenURI(0)).to.equal(tokenURI);
    });
  });

  describe("Token URI", function () {
    it("应该为铸造的NFT返回正确的URI", async () => {
      const tokenURI = "https://example.com/token/0";
      await myNFT.safeMint(addr1.address, tokenURI);

      expect(await myNFT.tokenURI(0)).to.equal(tokenURI);
    });

    it("应该在查询不存在的tokenId时回滚", async () => {
      await expect(myNFT.tokenURI(0)).to.be.revertedWithCustomError(
        myNFT,
        "ERC721NonexistentToken"
      );
    });
  });
});
