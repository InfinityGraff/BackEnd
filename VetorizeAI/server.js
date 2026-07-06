require('dotenv').config()
const express=require('express')
const multer=require('multer')
const app=express()
const upload=multer({storage:multer.memoryStorage()})
app.use(express.json())
const cors = require("cors")
app.use(cors({origin: "*"}))
const FormData = require("form-data")
app.get('/',(req,res)=>res.json({status:'online'}))

const API=process.env.VECTORIZER_API_URL||'https://vectorizer.ai/api/v1'
const AUTH='Basic '+Buffer.from(`${process.env.VECTORIZER_API_ID}:${process.env.VECTORIZER_API_SECRET}`).toString('base64')
const clampMaxColors=n=>{n=Number(n??32) ; if(n<0)return 0 ; if(n===1)return 2 ; if(n>256)return 256 ; return n}
const add=(fd,k,v)=>v!=null&&fd.append(k,String(v))

const fileName=type=>{
    if(!type)return'result.svg'
    if(type.includes('pdf'))return'result.pdf'
    if(type.includes('postscript'))return'result.eps'
    if(type.includes('dxf'))return'result.dxf'
    if(type.includes('png'))return'result.png'
    return'result.svg'
}

const addOutput=(fd,o={})=>{
    add(fd,'output.file_format',o.fileFormat)
    add(fd,'output.draw_style',o.drawStyle)
    add(fd,'output.shape_stacking',o.shapeStacking)
    add(fd,'output.group_by',o.groupBy)
    add(fd,'output.svg.version',o.svgVersion)
    add(fd,'output.svg.fixed_size',o.svgFixedSize)
    add(fd,'output.svg.adobe_compatibility_mode',o.svgAdobeCompatibilityMode)
    add(fd,'output.pdf.version',o.pdfVersion)
    add(fd,'output.pdf.compression_mode',o.pdfCompressionMode)
    add(fd,'output.eps.version',o.epsVersion)
    add(fd,'output.parameterized_shapes.flatten',o.flattenParameterizedShapes)
    add(fd,'output.curves.line_fit_tolerance',o.lineFitTolerance)
    if(o.allowedCurves){
        add(fd,'output.curves.allowed.quadratic_bezier',o.allowedCurves.quadraticBezier)
        add(fd,'output.curves.allowed.cubic_bezier',o.allowedCurves.cubicBezier)
        add(fd,'output.curves.allowed.circular_arc',o.allowedCurves.circularArc)
        add(fd,'output.curves.allowed.elliptical_arc',o.allowedCurves.ellipticalArc)
    }
    if(o.gapFiller){
        add(fd,'output.gap_filler.enabled',o.gapFiller.enabled)
        add(fd,'output.gap_filler.clip',o.gapFiller.clip)
        add(fd,'output.gap_filler.non_scaling_stroke',o.gapFiller.nonScalingStroke)
        add(fd,'output.gap_filler.stroke_width',o.gapFiller.strokeWidth)
    }
    if(o.strokeStyle){
        add(fd,'output.strokes.non_scaling_stroke',o.strokeStyle.nonScalingStroke)
        add(fd,'output.strokes.use_override_color',o.strokeStyle.useOverrideColor)
        add(fd,'output.strokes.override_color',o.strokeStyle.overrideColor)
        add(fd,'output.strokes.stroke_width',o.strokeStyle.strokeWidth)
    }
    add(fd,'output.dxf.compatibility_level',o.dxfCompatibilityLevel)
    add(fd,'output.bitmap.anti_aliasing_mode',o.bitmapAntiAliasingMode)
}
async function execute(fd){
    const headers = fd.getHeaders ? fd.getHeaders() : {}
    const r = await fetch(API + '/vectorize', {method: 'POST',headers: {Authorization: AUTH,...headers},body: fd})
    const buffer = Buffer.from(await r.arrayBuffer())
    if(!r.ok){throw new Error(buffer.toString())}
    const type = (r.headers.get('content-type') || 'image/svg+xml').split(';')[0]
    return {file: buffer,contentType: type,fileName: fileName(type),imageToken: r.headers.get('x-image-token')}
}

app.post('/api/vectorizer/vectorize',upload.single('image'),async(req,res)=>{
    try{if(!req.file) return res.status(400).send('Imagem não enviada.')
        const fd=new FormData()
        fd.append('image', req.file.buffer, {filename: req.file.originalname,contentType: req.file.mimetype})
        fd.append('mode',process.env.VECTORIZER_MODE||'test') // production
        fd.append('output.file_format','svg')
        fd.append('policy.retention_days',process.env.VECTORIZER_RETENTION_DAYS||'1')
        fd.append('processing.max_colors',clampMaxColors(req.body.maxColors))
        const r=await execute(fd)
        res.set('Content-Type',r.contentType)
           .set('X-Image-Token',r.imageToken||'')
           .set('X-File-Name',r.fileName)
           .send(r.file)
    }catch(e){console.error(e) ; res.status(500).send(e.message)}
})
app.post('/api/vectorizer/revectorize',async(req,res)=>{
    try{const{imageToken,palette,options}=req.body
        if(!imageToken) return res.status(400).send('imageToken obrigatório.')
        if((process.env.VECTORIZER_RETENTION_DAYS||'1')==='0') return res.status(400).send('Re-vetorização indisponível: retention_days=0.')
        const fd=new FormData()
        fd.append('image.token',imageToken)
        fd.append('mode',process.env.VECTORIZER_MODE||'production')
        if(palette) fd.append('processing.palette',palette)
        addOutput(fd,options)
        const r=await execute(fd)
        res.set('Content-Type',r.contentType)
           .set('X-Image-Token',r.imageToken||'')
           .set('X-File-Name',r.fileName)
           .send(r.file)
    }catch(e){console.error(e) ; res.status(500).send(e.message)}
})
const PORT=process.env.PORT||8080

app.listen(PORT,()=>console.log(`Servidor iniciado na porta ${PORT}`))

