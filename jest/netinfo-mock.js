module.exports = {
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({
      type: 'wifi',
      isConnected: true,
      isInternetReachable: true,
    })),
    addEventListener: jest.fn(() => jest.fn()),
  },
};
