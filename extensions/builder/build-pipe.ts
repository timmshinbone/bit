import GeneralError from 'bit-bin/dist/error/general-error';
import { ComponentMap } from '@teambit/component';
import { Logger } from '@teambit/logger';
import Bluebird from 'bluebird';
import prettyTime from 'pretty-time';
import { ArtifactFactory, ArtifactList } from './artifact';
import { BuildContext, BuildTask, BuiltTaskResult } from './build-task';
import { InvalidTask } from './exceptions';
import { ComponentResult } from './types';

export type BuildPipeResults = {
  /**
   * results of all tasks executed in the build pipeline.
   */
  tasksResults: TaskResults[];

  /**
   * start time of the build pipeline.
   */
  startTime: number;

  /**
   * end time of the build pipeline.
   */
  endTime: number;
};

export type TaskResults = {
  /**
   * task itself. useful for getting its id/description later on.
   */
  task: BuildTask;

  /**
   * component build results.
   */
  componentsResults: ComponentResult[];

  /**
   * artifacts generated by the build pipeline.
   */
  artifacts: ComponentMap<ArtifactList>;

  /**
   * timestamp of start initiation.
   */
  startTime: number;

  /**
   * timestamp of task completion.
   */
  endTime: number;
};

export class BuildPipe {
  constructor(
    /**
     * array of services to apply on the components.
     */
    readonly tasks: BuildTask[],
    readonly logger: Logger,
    readonly artifactFactory: ArtifactFactory
  ) {}

  /**
   * execute a pipeline of build tasks.
   */
  async execute(buildContext: BuildContext): Promise<BuildPipeResults> {
    const startTime = Date.now();
    const tasksResults = await this.executeTasks(buildContext);
    const endTime = Date.now();

    return {
      startTime,
      tasksResults,
      endTime,
    };
  }

  private async executeTasks(buildContext: BuildContext): Promise<TaskResults[]> {
    const longProcessLogger = this.logger.createLongProcessLogger('running tasks', this.tasks.length);
    const results: TaskResults[] = await Bluebird.mapSeries(this.tasks, async (task: BuildTask) => {
      if (!task) {
        throw new InvalidTask(task);
      }
      const taskName = `${task.id} ${task.description || ''}`;
      longProcessLogger.logProgress(taskName);
      const startTask = process.hrtime();
      const taskStartTime = Date.now();
      const buildTaskResult = await task.execute(buildContext);
      const endTime = Date.now();
      // TODO: move this function to the upper scope. that should happen from the consumer of the service.
      // (e.g. onTag/onSnap slot, build command, etc.)
      this.throwIfErrorsFound(task, buildTaskResult);
      const duration = prettyTime(process.hrtime(startTask));
      this.logger.consoleSuccess(`task "${taskName}" has completed successfully in ${duration}`);
      const defs = buildTaskResult.artifacts || [];
      const artifacts = this.artifactFactory.generate(buildContext, defs, task);

      return {
        task,
        componentsResults: buildTaskResult.componentsResults,
        artifacts,
        startTime: taskStartTime,
        endTime,
      };
    });
    longProcessLogger.end();
    return results;
  }

  private throwIfErrorsFound(task: BuildTask, taskResult: BuiltTaskResult) {
    const compsWithErrors = taskResult.componentsResults.filter((c) => c.errors?.length);
    if (compsWithErrors.length) {
      this.logger.consoleFailure(`task "${task.id}" has failed`);
      const title = `Builder found the following errors while running "${task.id}" task\n`;
      let totalErrors = 0;
      const errorsStr = compsWithErrors
        .map((c) => {
          const rawErrors = c.errors || [];
          const errors = rawErrors.map((e) => (typeof e === 'string' ? e : e.toString()));
          totalErrors += errors.length;
          return `${c.component.id.toString()}\n${errors.join('\n')}`;
        })
        .join('\n\n');
      const summery = `\n\nFound ${totalErrors} errors in ${compsWithErrors.length} components`;
      throw new GeneralError(title + errorsStr + summery);
    }
  }

  /**
   * create a build pipe from an array of tasks.
   */
  static from(tasks: BuildTask[], logger: Logger, artifactFactory: ArtifactFactory) {
    return new BuildPipe(tasks, logger, artifactFactory);
  }
}
