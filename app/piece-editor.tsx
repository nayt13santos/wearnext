'use client';
import {useEffect,useRef,useState} from 'react';
import {RotateCw,Upload} from 'lucide-react';
import PhotoPicker from './photo-picker';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Checkbox} from '@/components/ui/checkbox';
import {Slider} from '@/components/ui/slider';
import {categories,colors,type Piece} from '@/lib/wardrobe';
import {processPhoto,type PhotoResult} from '@/lib/photo';
import {photoSource} from '@/lib/client';
export function Choice({label,value,options,onChange}:{label:string;value:string;options:readonly string[];onChange:(s:string)=>void}){return <label className="field"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger className="choice-trigger" aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></label>}
export function Toggle({label,checked,onChange,disabled=false}:{label:string;checked:boolean;onChange:(b:boolean)=>void;disabled?:boolean}){return <label className="toggle"><Checkbox disabled={disabled} checked={checked} onCheckedChange={v=>onChange(v===true)}/><span>{label}</span></label>}
export function PiecePhoto({piece,className=''}:{piece:Piece;className?:string}){
 const [source,setSource]=useState(''),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const node=useRef<HTMLDivElement>(null);const privatePhoto=piece.image.startsWith('wardrobe-photo:');
 useEffect(()=>{let active=true;setSource('');setFailed(false);if(!privatePhoto)return;const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();void photoSource(piece.id).then(url=>{if(active)setSource(url);}).catch(()=>{if(active)setFailed(true);});},{rootMargin:'250px'});if(node.current)observer.observe(node.current);return()=>{active=false;observer.disconnect();};},[piece.id,piece.image,privatePhoto,retry]);
 if(piece.sample!==undefined)return <div role="img" aria-label={piece.name} className={'piece-photo '+className} style={{backgroundImage:`url(${import.meta.env.BASE_URL}demo-catalog.png)`,backgroundSize:'300% 200%',backgroundPosition:`${(piece.sample%3)*50}% ${piece.sample<3?0:100}%`}}/>;
 if(privatePhoto)return <div ref={node} className={'piece-photo private-photo '+className}>{source?<img src={source} alt={piece.name}/>:failed?<span role="img" aria-label={'Could not load '+piece.name} onClick={e=>{e.stopPropagation();setRetry(n=>n+1);}}>Photo unavailable · tap to retry</span>:<span role="status">Loading photo…</span>}</div>;
 return <img className={'piece-photo '+className} alt={piece.name} src={piece.image} loading="lazy"/>;
}
const blank:Piece={id:'',name:'',category:'Top',color:'White',style:'Casual',warmth:1,pattern:'Solid',material:'Cotton',waterproof:false,laundry:false,archived:false,favorite:false,image:''};
export default function PieceEditor({open,onClose,onSave,existing,purchase=false}:{open:boolean;onClose:()=>void;onSave:(piece:Piece,photo:PhotoResult|null)=>Promise<void>;existing?:Piece|null;purchase?:boolean}){
 const [piece,setPiece]=useState<Piece>(blank),[photo,setPhoto]=useState<PhotoResult|null>(null),[source,setSource]=useState<File|null>(null),[files,setFiles]=useState<File[]>([]),[rotation,setRotation]=useState(0),[clean,setClean]=useState(false),[zoom,setZoom]=useState(1),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[failed,setFailed]=useState(false);
 const request=useRef(0);const photoRef=useRef<PhotoResult|null>(null);
 useEffect(()=>{if(open){setPiece(existing||{...blank});setPhoto(null);setSource(null);setFiles([]);setError('');setFailed(false);setBusy(false);setRotation(0);setClean(false);setZoom(1);}return()=>{request.current++;if(photoRef.current)URL.revokeObjectURL(photoRef.current.url);photoRef.current=null;};},[open,existing]);
 const set=<K extends keyof Piece>(key:K,value:Piece[K])=>setPiece(p=>({...p,[key]:value}));
 async function choose(file:File,reset=true,r=rotation,c=clean,z=zoom){
  const token=++request.current;setBusy(true);setError('');setFailed(false);
  if(reset){
   // The current file remains available for Retry/Skip, even if decoding fails.
   if(photoRef.current)URL.revokeObjectURL(photoRef.current.url);
   photoRef.current=null;setPhoto(null);setSource(file);setRotation(0);setClean(false);setZoom(1);
   setPiece({...blank,name:file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ').slice(0,100)});
  }
  try{
   const result=await processPhoto(file,{rotation:reset?0:r,clean:reset?false:c,zoom:reset?1:z});
   if(token!==request.current){URL.revokeObjectURL(result.url);return;}
   if(photoRef.current)URL.revokeObjectURL(photoRef.current.url);
   photoRef.current=result;setPhoto(result);setSource(file);
   setPiece(p=>({...p,image:result.url,color:reset?result.color:p.color,fingerprint:result.fingerprint}));
  }catch(e){
   if(token===request.current){setError((e as Error).message);setFailed(reset);}
  }finally{if(token===request.current)setBusy(false);}
 }
 function skipFailed(){
  if(busy||saving||!failed)return;
  if(files.length){const [next,...rest]=files;setFiles(rest);void choose(next,true);}
  else onClose();
 }
 async function save(){if(!piece.name.trim()||(!photo&&!existing)){setError('Add a photo and a name first.');return;}setSaving(true);setError('');try{await onSave(piece,photo);if(files.length){const [next,...rest]=files;setFiles(rest);await choose(next,true);}else onClose();}catch(e){setError((e as Error).message);}finally{setSaving(false);}}
 return <Dialog open={open} onOpenChange={v=>{if(!v&&!saving)onClose();}}><DialogContent className="photo-dialog"><DialogHeader><DialogTitle>{existing?'Edit clothing':purchase?'Check a potential purchase':'Add to your wardrobe'}</DialogTitle><DialogDescription>{purchase?'Your photo stays in this preview until you choose to add it.':'Take a photo, or upload several to review and save one at a time.'}</DialogDescription></DialogHeader><div className="editor-grid"><div>{existing?<div className="upload-zone"><PiecePhoto piece={piece}/></div>:<PhotoPicker disabled={busy||saving} multiple={!purchase} onChoose={list=>{setFiles(list.slice(1));void choose(list[0],true);}}>{photo&&<PiecePhoto piece={{...piece,sample:undefined,image:photo.url}}/>}</PhotoPicker>}{!existing&&<>{failed&&source&&<div className="photo-recovery" role="group" aria-label="Photo needs attention"><p>Could not prepare “{source.name}”. Your remaining {files.length} photo{files.length===1?'':'s'} are still queued.</p><div className="photo-picker-actions"><button className="secondary" disabled={busy||saving} onClick={()=>void choose(source,true)}>Retry photo</button><button className="secondary" disabled={busy||saving} onClick={skipFailed}>Skip this photo</button></div></div>}{source&&photo&&<div className="photo-tools"><button className="quiet" disabled={busy||saving} onClick={()=>{const r=(rotation+90)%360;setRotation(r);void choose(source,false,r,clean,zoom);}}><RotateCw size={16}/>Rotate</button><Toggle label="Clean plain background" disabled={busy||saving} checked={clean} onChange={v=>{setClean(v);void choose(source,false,rotation,v,zoom);}}/><label className="field"><span>Crop / zoom</span><Slider min={1} max={2} step={.05} value={[zoom]} onValueChange={([v])=>setZoom(v)} onValueCommit={([v])=>void choose(source,false,rotation,clean,v)} disabled={busy||saving}/></label><p>Best on a plain, contrasting background. Review the result; turn cleanup off if it removes part of the clothing.</p></div>}</>}{busy&&<p role="status">Processing photo…</p>}</div><div className="editor-fields"><label className="field"><span>Name</span><input value={piece.name} maxLength={100} onChange={e=>set('name',e.target.value)} placeholder="e.g. Blue linen shirt"/></label><div className="field-pair"><Choice label="Category" value={piece.category} options={categories} onChange={v=>set('category',v as Piece['category'])}/><Choice label="Color" value={piece.color} options={colors} onChange={v=>set('color',v)}/><Choice label="Dress code" value={piece.style} options={['Casual','Smart','Formal','Sport','Versatile']} onChange={v=>set('style',v)}/><Choice label="Weight" value={['Light','Medium','Warm'][piece.warmth-1]} options={['Light','Medium','Warm']} onChange={v=>set('warmth',['Light','Medium','Warm'].indexOf(v)+1)}/><Choice label="Pattern" value={piece.pattern} options={['Solid','Striped','Checked','Printed']} onChange={v=>set('pattern',v)}/><Choice label="Material" value={piece.material} options={['Cotton','Linen','Denim','Wool','Synthetic','Leather','Other']} onChange={v=>set('material',v)}/></div><Toggle label="Rain-friendly" checked={piece.waterproof} onChange={v=>set('waterproof',v)}/><Toggle label="One of my favorites" checked={piece.favorite} onChange={v=>set('favorite',v)}/><p className="form-note">Color is suggested from the photo. Confirm the category, fabric and dress code yourself—this version does not identify garments automatically.</p>{error&&<p className="error" role="alert">{error}</p>}{saving&&!purchase&&<p className="form-note" role="status">Saving to your private Google Drive and Sheet… Keep this window open.</p>}<button className="primary full" disabled={busy||saving||(!photo&&!existing)} onClick={()=>void save()}><Upload size={17}/>{saving?'Saving…':purchase?'Use this item':existing?'Save changes':files.length?`Save & next (${files.length} left)`:'Save clothing'}</button></div></div></DialogContent></Dialog>;
}
