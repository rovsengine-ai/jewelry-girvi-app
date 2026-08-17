import { SaveFormat } from 'expo-image-manipulator';

import { prepareItemPhoto } from '@/lib/prepare-item-photo';

const mockRenderAsync = jest.fn();
const mockSaveAsync = jest.fn();
const mockResize = jest.fn();
const mockManipulate = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (...args: unknown[]) => mockManipulate(...args),
  },
}));

describe('prepareItemPhoto', () => {
  beforeEach(() => {
    mockResize.mockReset();
    mockRenderAsync.mockReset();
    mockSaveAsync.mockReset();
    mockManipulate.mockReset();
    mockSaveAsync.mockResolvedValue({ uri: 'file:///cache/item.jpg' });
    mockRenderAsync.mockResolvedValue({ saveAsync: mockSaveAsync });
    mockManipulate.mockReturnValue({ resize: mockResize, renderAsync: mockRenderAsync });
  });

  test('resizes to 480px and saves JPEG at high compression', async () => {
    await expect(prepareItemPhoto('file:///tmp/ornament.heic')).resolves.toEqual({
      uri: 'file:///cache/item.jpg',
      mimeType: 'image/jpeg',
    });
    expect(mockManipulate).toHaveBeenCalledWith('file:///tmp/ornament.heic');
    expect(mockResize).toHaveBeenCalledWith({ width: 480 });
    expect(mockSaveAsync).toHaveBeenCalledWith({
      compress: 0.1,
      format: SaveFormat.JPEG,
    });
  });
});
