module.exports = {
  git: {
    tagName: 'v${version}',
    commitMessage: 'chore: v${version}',
    requireCleanWorkingDir: false,
    requireBranch: 'release',
  },
  npm: {
    publish: false,
  },
  prompt: {
    ghRelease: false,
    glRelease: false,
    publish: false,
  },
  plugins: {
    '@release-it/conventional-changelog': {
      preset: 'angular',
      infile: 'CHANGELOG.md',
    },
  },
};
