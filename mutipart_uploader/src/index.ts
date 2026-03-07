import express, { urlencoded } from 'express'
import cors from 'cors';
import { Logger } from 'ruki-logger';
import router from './routes';
const port = process.env.PORT || 3006;

const configureLogger = () => {
  Logger.configure({
    hideTimestamp: false,
    timestampFormat: "iso",
    format: "#2%##2%###4%####",
    tagDecorator: "[]",
    colorOptions: {
      location: "#505a5bff",
    },
    locationPath: 'relative',
    levelColors: {
      error: "#f63d3dff",
      warn: "#ffa500ff",
      info: "#7c2a89ff",
      highlight: "#ffd000ff",
      task: "#21d321ff",
      quiet: "#505a5bff",
      test: "#2a892aff",

    },
    levelTaggingOptions: {
      error: { tag: '[ERROR]' },
      warn: { tag: '[WARN]' },
      info: { tag: '[INFO]' },
      highlight: { tag: '[HIGHLIGHT]' },
      task: { tag: '[TASK]' },
      quiet: { tag: '[VERBOSE]' },
    },
    forceColorLevel: 3,
    enableLevelTagging: true,
    cellSizes: {
      timestamp: { min: 26 },
      tag: { min: 20 },
      location: { min: 60 },
    },
  });
}
configureLogger();


function expressApp() {
  const app = express();
  app.use(express.json());
  app.use(urlencoded({ extended: true }));
  app.set('trust proxy', 1); // Cloud Run adds one proxy layer (load balancer)
  app.use(cors({
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization", "x-access-token", "x-api-key"],
  }));
  // Routes
  app.use("/health", (req, res) => {
    res.status(200).json({
      status: "success",
      message: `Producer is healthy and running`,
    });
  });

  app.use("/v1", router)


  // Serve static files
  app.use(express.static("public"));
  return app;
}

// Start server first, then initialize Redis
const server = expressApp().listen(port, () => {
  Logger.info(`Server is running on port: ${port}`);
  // Initialize Redis after server starts listening
 //  UploadService.instance.processJobs();
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);


function shutdown() {
  Logger.info('Shutting down server...');
  server.close(() => {
    Logger.info('Server closed.');
    // Close other resources like database connections here if needed
    process.exit(0);
  });
}
