const path = require('path');

const SRC_DIR = path.resolve(__dirname, 'lambda/custom');
const OUT_DIR = path.resolve(__dirname, 'lambda/custom/build');

module.exports = {
  entry: [`${SRC_DIR}/index.js`],
  target: 'node',
  externals: ['aws-sdk'],
  output: {
    path: OUT_DIR,
    filename: 'index.js',
    library: 'index',
    libraryTarget: 'umd'
  }
};
