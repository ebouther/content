const { Octokit, App, Action } = require("@octokit/rest");
const { createAppAuth } = require("@octokit/auth-app");
const { uuid } = require('uuidv4');

const owner = '<%= options.owner %>';
const repo = '<%= options.repo %>';
const branch = '<%= options.branch %>';

const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: '<%= options.appId %>',
    privateKey: `<%= options.privateKey %>`,
    installationId: '<%= options.installationId %>',
  },
});


const fetchFile = async (filePath) => {
  return 'FAKE FILE CONTENT';
}

/* Github update of @filePath with @content */
const saveFile = async ({filePath, content}) => {

  console.log(await octokit.rest.apps.getAuthenticated())

  const { data: { object: { sha: currCommitSha }} } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  console.log('commit sha: ', currCommitSha);


  const { data: { tree: { sha: treeSha } } } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: currCommitSha,
  })
  console.log('tree sha: ', treeSha);


  const newBranch = `heads/octo/${uuid()}`;

  /* Create Branch */
  const ref = await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/${newBranch}`,
    sha: currCommitSha,
  });


  /* Create Blob */
  //const content = "OCTO FILE!!!"; // await getFileAsUTF8(filePath)
  const { data: { sha: blobSha, url } } = await octokit.git.createBlob({
    owner,
    repo,
    content,
    encoding: 'utf-8',
  });
  console.log('BLOB SHA: ', blobSha, url);

  /* Create Tree */
  const tree = [{sha: blobSha, path: filePath}].map(({ sha, path }, index) => ({
    path,
    mode: `100644`,
    type: `blob`,
    sha: blobSha,
  }));
  console.log(tree);

  const { data: { sha: newTreeSha } } = await octokit.git.createTree({
    owner,
    repo,
    tree,
    base_tree: treeSha,
  });
  console.log('newTree: ', newTreeSha);


  /* Create Commit */
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message: 'Octo Commit !',
    tree: newTreeSha,
    parents: [currCommitSha],
  });

  console.log('NEW COMMIT :', newCommit);

  /* Update Branch */
  const updateRef = await octokit.git.updateRef({
    owner,
    repo,
    ref: newBranch,
    sha: newCommit.sha,
  })

  console.log('UPDATE REF :', updateRef);
};

export default {
  saveFile,
  fetchFile
}