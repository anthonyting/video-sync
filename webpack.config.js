const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const path = require('path');

module.exports = /** @type {import('webpack').Configuration} */ ({
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    receiver: path.resolve(__dirname, 'frontend/js/stream-receiver.ts'),
    sender: path.resolve(__dirname, 'frontend/js/stream-sender.ts')
  },
  devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'eval',
  module: {
    rules: [{
      test: /\.ts$/,
      use: 'ts-loader',
      exclude: /node_modules/,
    }],
  },
  resolve: {
    extensions: ['.ts']
  },
  output: {
    path: path.resolve(__dirname, 'public/dist'),
    filename: '[name].bundle.js'
  },
  plugins: [
    new CleanWebpackPlugin()
  ]
});
