const {
  CleanWebpackPlugin
} = require('clean-webpack-plugin');
const webpack = require('webpack');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const IgnoreEmitPlugin = require('ignore-emit-webpack-plugin');

module.exports = env => /** @type {import('webpack').Configuration} */ ({
  mode: env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    receiver: path.resolve(__dirname, 'frontend/js/stream-receiver.ts'),
    sender: path.resolve(__dirname, 'frontend/js/stream-sender.ts'),
    style: path.resolve(__dirname, 'frontend/css/style.css')
  },
  devtool: env.NODE_ENV === 'production' ? 'source-map' : 'eval-cheap-module-source-map',
  module: {
    rules: [{
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader'
          }
        ]
      },
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      }
    ],
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
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css'
    }),
    new OptimizeCssAssetsPlugin(),
    new IgnoreEmitPlugin(/style.*.js/) // remove this when patched https://github.com/webpack/webpack/issues/11671
  ],
  optimization: {
    removeEmptyChunks: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            toplevel: true,
            unsafe_math: true,
            unsafe: true
          }
        }
      })
    ]
  }
});
