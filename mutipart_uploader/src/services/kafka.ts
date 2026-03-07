import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import { Logger } from 'ruki-logger';

export const UPLOAD_TOPIC = 'upload-chunks';

const kafka = new Kafka({
  clientId: 'multipart-uploader',
  brokers: [(process.env.KAFKA_LISTENER ?? 'kafka:9092')],
  logLevel: logLevel.WARN,
});

let _producer: Producer | null = null;
let _consumer: Consumer | null = null;

export async function getProducer(): Promise<Producer> {
  if (_producer) return _producer;
  _producer = kafka.producer();
  await _producer.connect();
  Logger.info('Kafka producer connected');
  return _producer;
}

export async function getConsumer(groupId = 'upload-worker'): Promise<Consumer> {
  if (_consumer) return _consumer;
  _consumer = kafka.consumer({ groupId });
  await _consumer.connect();
  Logger.info('Kafka consumer connected');
  return _consumer;
}

export async function disconnectKafka() {
  await _producer?.disconnect();
  await _consumer?.disconnect();
  _producer = null;
  _consumer = null;
}
