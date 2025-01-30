const gulp = require('gulp');
const browserSync = require('browser-sync').create();
const { exec } = require('child_process');

// Task to build the documentation
gulp.task('build-docs', (cb) => {
  exec('antora site-local.yml', (err, stdout, stderr) => {
    console.log(stdout);
    console.error(stderr);
    cb(err);
  });
});

// Task to serve the documentation with live reload
gulp.task('serve', gulp.series('build-docs', () => {
  browserSync.init({
    server: {
      baseDir: './build/local'
    }
  });

  gulp.watch(['./docs/**/*.adoc', './site-local.yml'], gulp.series('build-docs', (done) => {
    browserSync.reload();
    done();
  }));
}));

// Default task
gulp.task('default', gulp.series('serve'));