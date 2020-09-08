import type { webpackCompilationDoneEvent } from '../events';
class WebpackCompilerDonePlugin {
  pubsub: any;

  constructor({ options }) {
    this.pubsub = options.pubsub;
  }

  private createEvent: () => webpackCompilationDoneEvent = () => {
    return {
      type: 'webpack-compilation-done',
      version: '0.0.0.1',
      timestamp: new Date().getTime().toString(),
      body: {
        webpackCompilerVersion: 'whatever',
      },
    };
  };

  apply(compiler) {
    compiler.hooks.done.tap('webpack-compiler-done-plugin', (
      stats /* stats is passed as an argument when done hook is tapped.  */
    ) => {
      this.pubsub.publishToTopic('webpack-pubsub-topic', this.createEvent());
    });
  }
}

module.exports = WebpackCompilerDonePlugin;
