import {Router} from "express";

const router = Router();

router.get("/upload", async (req, res) => {
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ success: false, message: 'No files were uploaded.' });
    }
    console.log('Received file upload request:', Object.keys(req.files));
    const file = req.files.file; // Assuming the file input field is named 'file'
    const {uploadPath} = req.query as {uploadPath?: string};
    try {
        const result = await UploadsService.instance.registerJob(file, uploadPath);
        res.json(result);
    } catch (error) {
        console.error('Error registering upload job:', error);
        res.status(500).json({ success: false, message: 'Failed to register file upload job.' });
    }
});


export default router;