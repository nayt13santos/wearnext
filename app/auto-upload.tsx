import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import PhotoPicker from './photo-picker';
import {Choice,PiecePhoto,Toggle} from './piece-editor';
import {categories,colors,type Piece} from '@/lib/wardrobe';
import {processPhoto,analyzePhoto,type PhotoResult} from '@/lib/photo';
import {prepareUploadPhoto} from '@/lib/photo-cleanup';
import {recognizeCategory} from '@/lib/category-recognition';
import {pieceFromPhoto} from '@/lib/photo-tags';
import {checkDuplicate,type DuplicateCheck} from '@/lib/wardrobe-photos';

type Job={file:File;status:'waiting'|'working'|'saved'|'duplicate'|'review'|'failed';message:string;photo?:PhotoResult;piece?:Piece;required:string[];automaticName?:string;duplicates?:DuplicateCheck};
type Props={open:boolean;onClose:()=>void;loadPieces:()=>Promise<Piece[]>;onSave:(piece:Piece,photo:PhotoResult)=>Promise<Piece>};
export default function AutoUpload({open,onClose,loadPieces,onSave}:Props){
  const [jobs,setJobs]=useState<Job[]>([]),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const queue=useRef<Job[]>([]),known=useRef<Piece[]>([]),working=useRef(false),stop=useRef(false),generation=useRef(0),controller=useRef<AbortController|null>(null);
  function publish(){setJobs([...queue.current]);}
  useEffect(()=>{if(!open)return;queue.current=[];setJobs([]);setStatus('');setError('');stop.current=false;
    return()=>{generation.current++;controller.current?.abort();queue.current.forEach(job=>{if(job.photo)URL.revokeObjectURL(job.photo.url);});queue.current=[];};
  },[open]);
  async function process(list?:File[]){
    if(working.current)return;working.current=true;setBusy(true);setError('');stop.current=false;
    const token=generation.current,abort=new AbortController();controller.current=abort;
    const progress=(message:string)=>{if(token===generation.current)setStatus(message);};
    try{
      if(list){queue.current.push(...list.map(file=>({file,status:'waiting' as const,message:'Waiting',required:[]})));publish();}
      progress('Checking your wardrobe…');known.current=await loadPieces();abort.signal.throwIfAborted();
      for(const job of queue.current){
        if(stop.current||abort.signal.aborted)break;if(!['waiting','failed'].includes(job.status))continue;
        job.status='working';job.message='Preparing photo…';publish();
        try{
          if(!job.photo)job.photo=await processPhoto(job.file);
          abort.signal.throwIfAborted();
          progress('Checking for duplicates…');job.duplicates=await checkDuplicate(job.photo,known.current,abort.signal,progress);
          if(job.duplicates.exact){job.status='duplicate';job.message='Already saved as '+job.duplicates.exact.name;publish();continue;}
          if(!job.photo.cleanup)job.photo=await prepareUploadPhoto(job.photo,{signal:abort.signal,onProgress:progress});
          abort.signal.throwIfAborted();
          if(!job.piece){
            let recognition;try{recognition=await recognizeCategory(job.photo.original,{signal:abort.signal,onProgress:progress});}
            catch(e){abort.signal.throwIfAborted();recognition={category:null,confidence:0,label:''};}
            abort.signal.throwIfAborted();
            const analysis=job.photo.analysis||await analyzePhoto(job.photo.original);
            const result=pieceFromPhoto(recognition,analysis.colors,job.photo.url,job.photo.fingerprint);
            job.piece=result.piece;job.automaticName=result.piece.name;job.required=result.review;
          }
          if(job.required.length||job.duplicates.similar.length||job.duplicates.unchecked){
            job.status='review';job.message=job.duplicates.similar.length?'This may already be in your wardrobe.':job.duplicates.unchecked?'Some saved photos could not be checked for duplicates.':'A few details need your eye.';
          }else{
            progress('Saving '+job.piece.name+'…');const saved=await onSave(job.piece,job.photo);known.current=[saved,...known.current.filter(p=>p.id!==saved.id)];job.status='saved';job.message=job.photo.cleanup==='cleaned'?'Tagged, cleaned and saved':'Tagged and saved · Background kept';
          }
        }catch(e){if(abort.signal.aborted)break;job.status='failed';job.message=(e as Error).message;}
        if(token===generation.current)publish();
      }
      progress(stop.current?'Paused. Your remaining photos are ready to resume.':'Finished. Saved pieces are already in your wardrobe.');
    }catch(e){if(!abort.signal.aborted)setError((e as Error).message);}
    finally{working.current=false;if(token===generation.current){setBusy(false);publish();}}
  }
  async function saveReviewed(job:Job){
    if(working.current||!job.piece||!job.photo||job.required.length)return;
    working.current=true;setBusy(true);job.status='working';publish();
    try{const saved=await onSave(job.piece,job.photo);known.current=[saved,...known.current.filter(p=>p.id!==saved.id)];job.status='saved';job.message='Saved';}
    catch(e){job.status='review';job.message=(e as Error).message;}
    finally{working.current=false;setBusy(false);publish();}
  }
  function change(job:Job,key:keyof Piece,value:Piece[keyof Piece],field:string){
    if(!job.piece)return;
    if(key==='color'&&job.piece.name===job.automaticName&&job.piece.name.startsWith(job.piece.color+' ')){job.automaticName=String(value)+job.piece.name.slice(job.piece.color.length);job.piece={...job.piece,name:job.automaticName};}
    job.piece={...job.piece!,[key]:value};job.required=job.required.filter(r=>r!==field);publish();}
  const pending=jobs.filter(j=>['waiting','failed'].includes(j.status)).length;
  return <Dialog open={open} onOpenChange={v=>{if(!v&&!working.current)onClose();}}><DialogContent className="photo-dialog auto-upload"><DialogHeader><DialogTitle>Add your clothes</DialogTitle><DialogDescription>Photos are tagged, cleaned and saved automatically. Review possible duplicates or unclear details here.</DialogDescription></DialogHeader>
    <PhotoPicker disabled={busy} multiple onChoose={files=>void process(files)}/>
    <p className="small">One piece per photo works best.</p><details className="help-details"><summary>About automatic tags</summary><p className="form-note">Details are estimated from your photo. Fabric may stay Other; confirm rain protection yourself. The first scan downloads the detector so photos can be checked on your device.</p></details>
    {status&&<p role="status" className="upload-status">{status}</p>}{error&&<p role="alert" className="error">{error}</p>}
    {jobs.length>0&&<p className="upload-count">{jobs.filter(j=>j.status==='saved').length} saved · {jobs.filter(j=>j.status==='duplicate').length} already owned · {jobs.filter(j=>j.status==='review').length} to review</p>}
    <div className="upload-jobs">{jobs.map((job,index)=><article key={index} className="upload-job">
      <div className="upload-job-heading">{job.photo&&<img src={job.photo.url} alt={job.piece?.name||job.file.name}/>}<div><h3>{job.piece?.name||job.file.name}</h3><p>{job.message}</p>{job.status==='saved'&&job.piece&&<p className="small">{job.piece.category} · {job.piece.color} · {job.piece.pattern} · {job.piece.style}</p>}</div></div>
      {job.status==='review'&&job.piece&&<div className="upload-review">
        {!!job.duplicates?.similar.length&&<><p>Similar saved pieces</p><div className="duplicate-matches">{job.duplicates.similar.slice(0,4).map(piece=><div key={piece.id}><PiecePhoto piece={piece}/><span>{piece.name}{piece.archived?' (archived)':''}</span></div>)}</div><button className="secondary" disabled={busy} onClick={()=>{job.status='duplicate';job.message='Skipped — already owned';publish();}}>Already own this · skip</button></>}
        <label className="field"><span>Name</span><input value={job.piece.name} maxLength={100} disabled={busy} onChange={e=>change(job,'name',e.target.value,'Name')}/></label>
        <fieldset disabled={busy} className="field-pair">
          <Choice label="Category" value={job.required.includes('Category')?'':job.piece.category} options={categories} onChange={v=>change(job,'category',v,'Category')}/>
          <Choice label="Color" value={job.required.includes('Color')?'':job.piece.color} options={colors} onChange={v=>change(job,'color',v,'Color')}/>
          <Choice label="Pattern" value={job.required.includes('Pattern')?'':job.piece.pattern} options={['Solid','Striped','Checked','Printed']} onChange={v=>change(job,'pattern',v,'Pattern')}/>
          <Choice label="Dress code" value={job.piece.style} options={['Casual','Smart','Formal','Sport','Versatile']} onChange={v=>change(job,'style',v,'Dress code')}/>
          <Choice label="Material" value={job.piece.material} options={['Cotton','Linen','Denim','Wool','Synthetic','Leather','Other']} onChange={v=>change(job,'material',v,'Material')}/>
          <Choice label="Weight" value={['Light','Medium','Warm'][job.piece.warmth-1]} options={['Light','Medium','Warm']} onChange={v=>change(job,'warmth',['Light','Medium','Warm'].indexOf(v)+1,'Weight')}/>
        </fieldset><Toggle label="Rain-friendly (confirmed by me)" disabled={busy} checked={job.piece.waterproof} onChange={v=>change(job,'waterproof',v,'Rain-friendly')}/>
        {!!job.required.length&&<p className="small">Choose: {job.required.join(', ')}.</p>}
        <div className="photo-picker-actions"><button className="primary" disabled={busy||!!job.required.length||!job.piece.name.trim()} onClick={()=>void saveReviewed(job)}>{job.duplicates?.similar.length?'Save as a separate piece':'Save clothing'}</button><button className="quiet" disabled={busy} onClick={()=>{job.status='duplicate';job.message='Skipped';publish();}}>Skip photo</button></div>
      </div>}
    </article>)}</div>
    <div className="photo-picker-actions">{busy?<button className="secondary" onClick={()=>{stop.current=true;setStatus('Stopping after the current photo…');}}>Stop after this photo</button>:<>{pending>0&&<button className="secondary" onClick={()=>void process()}>Retry / resume ({pending})</button>}<button className="primary" onClick={onClose}>Done</button></>}</div>
  </DialogContent></Dialog>;
}
