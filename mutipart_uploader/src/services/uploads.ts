class UploadsService {
    private static _instance: UploadsService;
    public static instance = UploadsService.getInstance();
    private constructor() {}

    public static getInstance(): UploadsService {
        if (!UploadsService._instance) {
            UploadsService._instance = new UploadsService();
        }
        return UploadsService._instance;
    }

    public async registerJob(_file: File, _uploadPath?: string) {
        // Placeholder for job registration logic
        /**
         * With this service we need to check the file size and if it exceeds our threshold, 
         * we must create a multipart upload job. This involves:
         * 1. Generating a unique job ID.
         * 2. Divide the file into chunks based on a predefined chunk size.
         * 3. for each chunk we create a new enent in our job queue (e.g. Kafka) with the chunk data and metadata (job ID, chunk number, total chunks, etc.)
         * 4. each chunk must hold it's 
         */
    }
}
