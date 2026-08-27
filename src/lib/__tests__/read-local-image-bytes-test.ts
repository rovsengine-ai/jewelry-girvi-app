import { bytesFromDataUrl, readLocalImageBytes } from '@/lib/read-local-image-bytes';

jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(),
}));

const FileSystem = jest.requireMock('expo-file-system/legacy') as {
  readAsStringAsync: jest.Mock;
};

describe('readLocalImageBytes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('decodes a data URL without FileSystem (web camera/gallery)', async () => {
    const bytes = await readLocalImageBytes('data:image/jpeg;base64,QQ==');
    expect(Array.from(bytes)).toEqual(Array.from(bytesFromDataUrl('data:image/jpeg;base64,QQ==')));
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
  });

  test('reads native file URIs through the legacy FileSystem API', async () => {
    FileSystem.readAsStringAsync.mockResolvedValue('QQ==');
    const bytes = await readLocalImageBytes('file:///tmp/a.jpg');
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///tmp/a.jpg', {
      encoding: 'base64',
    });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
