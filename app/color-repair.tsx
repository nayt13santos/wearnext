import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Choice,PiecePhoto} from './piece-editor';
import {colors,type Piece} from '@/lib/wardrobe';
import {savedPhotoAnalysis,wardrobePhoto} from '@/lib/wardrobe-photos';
import {recognizeCategory} from '@/lib/category-recognition';
import {chooseColor} from '@/lib/photo-tags';

type Repair={piece:Piece;before:string;color:string;status:'waiting'|'working'|'unchanged'|'repaired'|'review'|'failed'|'undone';message:string};
type Props={open:boolean;onClose:()=>void;loadPieces:()=>Promise<Piece[]>;saveColor:(id:string,from:string,to:string)=>Promise<void>};
export default function ColorRepair({open,onClose,loadPieces,saveColor}:Props){
  const [rows,setRows]=useState<Repair[]>([]),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const repairs=useRef<Repair[]>([]),working=useRef(false),stop=useRef(false),controller=useRef<AbortController|null>(null),generation=useRef(0);
  const publish=()=>setRows([...repairs.current]);
  useEffect(()=>{if(!open)return;repairs.current=[];setRows([]);setError('');setStatus('');return()=>{generation.current++;controller.current?.abort();};},[open]);
  async function scan(){
    if(working.current)return;working.current=true;setBusy(true);setError('');stop.current=false;
    const abort=new AbortController(),token=generation.current;controller.current=abort;
    try{
      if(!repairs.current.length){setStatus('Loading your saved pieces…');const pieces=await loadPieces();abort.signal.throwIfAborted();repairs.current=pieces.map(piece=>({piece,before:piece.color,color:piece.color,status:'waiting',message:'Waiting'}));publish();}
      let modelAvailable=true;
      for(let i=0;i<repairs.current.length;i++){
        if(stop.current||abort.signal.aborted)break;const row=repairs.current[i];if(!['waiting','failed'].includes(row.status))continue;
        row.status='working';row.message='Checking photo…';publish();setStatus(`Checking ${i+1} of ${repairs.current.length}: ${row.piece.name}`);
        try{
          const analysis=await savedPhotoAnalysis(row.piece);abort.signal.throwIfAborted();
          let semantic;
          if(modelAvailable){try{semantic=(await recognizeCategory(await wardrobePhoto(row.piece),{signal:abort.signal,onProgress:message=>{if(!abort.signal.aborted)setStatus(message);}})).attributes?.color;}catch(e){abort.signal.throwIfAborted();modelAvailable=false;}}
          abort.signal.throwIfAborted();const decision=chooseColor(analysis.colors,semantic);row.color=decision.color||row.before;
          if(decision.certain){
            if(row.color===row.before){row.status='unchanged';row.message='Color checked';}
            else{await saveColor(row.piece.id,row.before,row.color);row.status='repaired';row.message='Corrected';}
          }else{row.status='review';row.message=decision.reason;}
        }catch(e){if(abort.signal.aborted)break;row.status='failed';row.message=(e as Error).message;}
        if(token===generation.current)publish();
      }
      if(token===generation.current)setStatus(stop.current?'Paused. You can resume the remaining photos.':repairs.current.length?'Color check finished. Review any uncertain photos below.':'Your wardrobe has no saved photos yet.');
    }catch(e){if(!abort.signal.aborted)setError((e as Error).message);}
    finally{working.current=false;if(token===generation.current){setBusy(false);publish();}}
  }
  async function apply(row:Repair,undo=false){
    if(working.current)return;working.current=true;setBusy(true);
    try{await saveColor(row.piece.id,undo?row.color:row.before,undo?row.before:row.color);row.status=undo?'undone':'repaired';if(undo)row.color=row.before;row.message=undo?'Original tag restored':'Color saved';}
    catch(e){row.message=(e as Error).message;}
    finally{working.current=false;setBusy(false);publish();}
  }
  const remaining=rows.filter(r=>['waiting','failed'].includes(r.status)).length;
  return <Dialog open={open} onOpenChange={v=>{if(!v&&!working.current)onClose();}}><DialogContent className="photo-dialog color-repair"><DialogHeader><DialogTitle>Repair color tags</DialogTitle><DialogDescription>Check all saved photos and fix clear color mistakes automatically. Review uncertain colors here.</DialogDescription></DialogHeader>
    <p className="form-note">Keep this screen open while checking. You can undo corrections before closing. The first scan may take longer.</p>
    {status&&<p className="upload-status" role="status">{status}</p>}{error&&<p className="error" role="alert">{error}</p>}
    {!!rows.length&&<p className="upload-count">{rows.filter(r=>r.status==='repaired').length} corrected · {rows.filter(r=>r.status==='unchanged').length} already correct · {rows.filter(r=>r.status==='review').length} to review</p>}
    <div className="repair-rows">{rows.map(row=><article key={row.piece.id} className="repair-row"><PiecePhoto piece={row.piece}/><div><h3>{row.piece.name}</h3><p>{row.before}{row.color!==row.before?' → '+row.color:''}</p><p className="small">{row.message}</p>
      {row.status==='review'&&<><Choice label={'Color for '+row.piece.name} value={row.color} options={colors} onChange={value=>{row.color=value;publish();}}/><button className="secondary" disabled={busy} onClick={()=>void apply(row)}>Save this color</button></>}
      {row.status==='repaired'&&<button className="quiet" disabled={busy} onClick={()=>void apply(row,true)}>Undo correction</button>}
    </div></article>)}</div>
    <div className="photo-picker-actions">{busy?<button className="secondary" onClick={()=>{stop.current=true;setStatus('Stopping after the current piece…');}}>Stop after this piece</button>:<>{(!rows.length||remaining>0)&&<button className="primary" onClick={()=>void scan()}>{rows.length?`Retry / resume (${remaining})`:'Check and repair colors'}</button>}<button className="secondary" onClick={onClose}>Done</button></>}</div>
  </DialogContent></Dialog>;
}
