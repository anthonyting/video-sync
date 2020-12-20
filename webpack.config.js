const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const webpack = require('webpack');
const path = require('path');

module.exports = env => /** @type {import('webpack').Configuration} */ ({
  mode: env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    receiver: path.resolve(__dirname, 'frontend/js/stream-receiver.ts'),
    sender: path.resolve(__dirname, 'frontend/js/stream-sender.ts')
  },
  devtool: env.NODE_ENV === 'production' ? 'source-map' : 'eval',
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
    new CleanWebpackPlugin(),
    new webpack.DefinePlugin({
      WEBSOCKET_SERVER: JSON.stringify(env.NODE_ENV === 'production' ? 'wss://anthonyting.xyz/abcde' : 'ws://localhost:3000')
    })
  ]
});
