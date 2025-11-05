
module.exports = {
  branches: ['main', {
    "name": 'staging',
    "prerelease": 'beta'
  },{
    "name": 'develop',
    "prerelease": 'dev'
  }],
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/npm',
      {
        npmPublish: true
      }
    ],
    '@semantic-release/changelog',
    [
      '@semantic-release/git',  
      {
        "assets": ["package.json", "CHANGELOG.md"],
        "message": "chore(release): ${nextRelease.version} [skip ci]"
      }
    ],
    '@semantic-release/github'
  ]
};