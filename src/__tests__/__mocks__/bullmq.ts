/**
 * BullMQ mock for Jest tests.
 *
 * Processor functions are tested directly (unit + integration).
 * BullMQ itself (Queue, Worker, scheduler) is infrastructure — mock it here so
 * tests don't need a real Redis with Lua scripting support.
 */

const mockJob = {
  id: 'mock-job-id',
  name: 'mock-job',
  data: {},
  opts: {},
};

export class Queue {
  constructor() {}
  async add() { return mockJob; }
  async addBulk() { return [mockJob]; }
  async getJob() { return mockJob; }
  async getJobs() { return []; }
  async getRepeatableJobs() { return []; }
  async removeRepeatableByKey() {}
  async close() {}
  on() { return this; }
  off() { return this; }
}

export class Worker {
  constructor() {}
  async close() {}
  on() { return this; }
  off() { return this; }
}

export class QueueEvents {
  constructor() {}
  async close() {}
  on() { return this; }
  off() { return this; }
}

export class QueueScheduler {
  constructor() {}
  async close() {}
}

export const UnrecoverableError = class extends Error {};
