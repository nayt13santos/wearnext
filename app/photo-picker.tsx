import {useRef, type ChangeEvent, type ReactNode} from 'react';
import {Camera, ImagePlus, Upload} from 'lucide-react';

type PhotoPickerProps = {
  disabled: boolean;
  multiple: boolean;
  onChoose: (files: File[]) => void;
  children?: ReactNode;
};

export default function PhotoPicker({disabled, multiple, onChoose, children}: PhotoPickerProps) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  function select(event: ChangeEvent<HTMLInputElement>, allowMultiple: boolean) {
    const selected = Array.from(event.currentTarget.files || []);
    // Let the same photo (or a camera's repeated filename) be selected again.
    event.currentTarget.value = '';
    // Cancelling a picker leaves the current preview and batch queue untouched.
    if (!disabled && selected.length) onChoose(allowMultiple ? selected : selected.slice(0, 1));
  }

  return <>
    <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp"
      aria-label="Upload clothing photos" multiple={multiple} disabled={disabled} hidden
      onChange={event => select(event, multiple)}/>
    <input ref={camera} type="file" accept="image/*" capture="environment"
      aria-label="Capture clothing photo" disabled={disabled} hidden
      onChange={event => select(event, false)}/>
    <button type="button" className="upload-zone" disabled={disabled}
      onClick={() => gallery.current?.click()} aria-label="Choose clothing photos">
      {children || <><ImagePlus size={38}/><strong>Add a clothing photo</strong><span>JPG, PNG or WebP</span></>}
    </button>
    <div className="photo-picker-actions">
      <button type="button" className="secondary" disabled={disabled} onClick={() => gallery.current?.click()}>
        <Upload size={18}/>{multiple ? 'Upload photos' : 'Upload photo'}
      </button>
      <button type="button" className="secondary" disabled={disabled} onClick={() => camera.current?.click()}>
        <Camera size={18}/>Take a photo
      </button>
    </div>
    <p className="photo-picker-note">Use your phone’s camera, or upload saved photos. On a computer, the camera button may open the file picker.</p>
  </>;
}
