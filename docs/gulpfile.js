'use strict';

const gulp = require('gulp');
const connect = require('gulp-connect');
const { exec } = require('child_process');

const buildDir = 'build/local';

// Task to build Antora documentation
gulp.task('build', (done) => {
  exec('antora site-local.yml', (err, stdout, stderr) => {
    console.log(stdout);
    console.error(stderr);
    done(err);
  });
});

// Task to serve files with live reload
gulp.task('serve', (done) => {
  connect.server({
    root: buildDir,
    livereload: true,
    port: 8080
  });
  done();
});

// Watch for changes and rebuild
gulp.task('watch', (done) => {
  gulp.watch(['**/*.adoc', 'site-local.yml'], gulp.series('build'));
  done();
});

// Default task
gulp.task('preview', gulp.series('build', gulp.parallel('serve', 'watch')));