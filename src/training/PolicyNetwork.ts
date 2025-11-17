import * as tf from "@tensorflow/tfjs";
import { Experience } from "./types.js";

export class PolicyNetwork {
  private readonly model: tf.LayersModel;
  private readonly actionCount: number;
  private readonly optimizer: tf.Optimizer;

  constructor(inputSize: number, actionCount: number, learningRate: number) {
    this.actionCount = actionCount;
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({
          units: 64,
          activation: "relu",
          inputShape: [inputSize],
        }),
        tf.layers.dense({ units: 64, activation: "relu" }),
        tf.layers.dense({ units: actionCount, activation: "linear" }),
      ],
    });
    this.optimizer = tf.train.adam(learningRate);
    this.model.compile({ optimizer: this.optimizer, loss: "meanSquaredError" });
  }

  act(observation: number[], epsilon: number): number {
    if (Math.random() < epsilon) {
      return Math.floor(Math.random() * this.actionCount);
    }
    return tf.tidy(() => {
      const input = tf.tensor2d([observation]);
      const qValues = this.model.predict(input) as tf.Tensor2D;
      const { indices } = qValues.argMax(1).topk(1);
      const action = indices.dataSync()[0];
      return action;
    });
  }

  async trainBatch(experiences: Experience[], gamma: number): Promise<void> {
    if (experiences.length === 0) return;

    const actions = experiences.map((e) => e.action);
    const rewards = experiences.map((e) => e.reward);
    const dones = experiences.map((e) => (e.done ? 1 : 0));

    const obsBatch = tf.tensor2d(experiences.map((e) => e.observation));
    const nextObsBatch = tf.tensor2d(experiences.map((e) => e.nextObservation));
    const actionTensor = tf.tensor1d(actions, "int32");
    const rewardTensor = tf.tensor1d(rewards);
    const doneTensor = tf.tensor1d(dones);

    const oneHotActions = tf.oneHot(actionTensor, this.actionCount);

    await this.optimizer.minimize(() => {
      const qPredAll = this.model.predict(obsBatch) as tf.Tensor2D;
      const qPred = tf.sum(tf.mul(qPredAll, oneHotActions), 1);

      const qNextAll = this.model.predict(nextObsBatch) as tf.Tensor2D;
      const qNextMax = qNextAll.max(1);
      const target = rewardTensor.add(
        qNextMax.mul(gamma).mul(tf.scalar(1).sub(doneTensor))
      );

      const loss = tf.losses
        .meanSquaredError(target, qPred)
        .mean() as tf.Scalar;
      return loss;
    });

    tf.dispose([
      obsBatch,
      nextObsBatch,
      actionTensor,
      rewardTensor,
      doneTensor,
      oneHotActions,
    ]);
  }
}
