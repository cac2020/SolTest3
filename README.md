## 项目结构
SolTest3 项目名称
.
├── README.md
├── contracts  #合约文件
│   ├── Auction.sol  #拍卖模板
│   ├── AuctionFactory.sol  #拍卖工厂
│   ├── FeeManager.sol      #手续费管理
│   ├── MyNFT.sol           #NFT合约
│   ├── MyNFTV2.sol         #NFT合约V2  升级合约
│   ├── PriceConverter.sol  #价格转换
│   └── test
│       └── MyToken.sol     #用于测试的ERC20代币
├── deploy  #部署脚本
│   ├── 000_tool
│   │   ├── 000_deploy_price_converter.js  #部署价格转换合约
│   │   └── 010_deploy_fee_manager.js      #部署手续费管理合约
│   ├── 010_nft
│   │   ├── 000_deploy_my_nft.js           #部署NFT合约
│   │   └── 001_deploy_my_nft_v2.js        #部署NFT升级合约V2
│   └── 020_auction
│       ├── 000_deploy_auction.js          #部署拍卖合约
│       └── 010_deploy_auction_factory.js  #部署拍卖工厂合约
├── deployments  #部署信息
│   └── localhost
│       ├── Auction.json
│       ├── AuctionFactory.json
│       ├── FeeManagerProxy.json
│       ├── MyNFTProxy.json
│       ├── MyNFTV2Proxy.json
│       ├── PriceConverter.json
│       └── solcInputs
│           └── 6b48cc9546373f84e826272d8b5264f9.json
├── hardhat.config.js #hardhat主配置文件
├── package-lock.json
├── package.json
└── test  #测试脚本
    ├── 010_test_price_convert.js  #测试价格转换合约
    ├── 020_test_fee_manager.js    #测试手续费管理合约
    ├── 030_test_my_nft.js         #测试NFT合约
    ├── 031_test_my_nft_v2.js      #测试NFT升级合约V2
    ├── 040_test_auction.js        #测试拍卖合约
    └── 050_test_auction_factory.js #测试拍卖工厂合约


## 功能说明


## 部署步骤

