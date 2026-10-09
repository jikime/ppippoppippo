// AWS has no access to a USB device attached to the development Mac.
export const devicePreviewOnly = import.meta.env.VITE_DEVICE_MODE === 'preview';
