const React = require('react');
const { View } = require('react-native');

/** Minimal stand-in so loan-detail tests do not load native SVG QR. */
function MockQRCode() {
  return React.createElement(View, { testID: 'mock-qrcode' });
}

module.exports = MockQRCode;
module.exports.default = MockQRCode;
