const React = require('react');
const { View } = require('react-native');

function SymbolView(props) {
  return React.createElement(View, { testID: props.testID ?? 'symbol-view' });
}

module.exports = {
  SymbolView,
};
