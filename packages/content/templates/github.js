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
    installationId: '<%= options.installationId %>'
  },
});

console.log(octokit)


const fetchFile = async (filePath) => {
  // disable response cache
  octokit.rest.repos.getContent.endpoint.defaults({ headers: { 'Cache-Control': 'no-cache' } });

  const { data: { content, encoding } } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref: `heads/${branch}`,
  });

  return (new Buffer(content, encoding)).toString('utf-8');
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


  const newBranch = `content/${uuid()}`;

  /* Create Branch */
  const ref = await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranch}`,
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
    ref: `heads/${newBranch}`,
    sha: newCommit.sha,
  })

  console.log('UPDATE REF :', updateRef);

  /* Create Pull Request */
  // const pr = await octokit.rest.pulls.create({
  //   title: filePath + ' update',
  //   owner,
  //   repo,
  //   head: newBranch,
  //   base: branch,
  // });

  // console.log('PULL REQUEST : ', pr);

  // // Wait for mergeable state to be known
  // if (pr.mergeable_state === "unknown") {
  //   
  // }

  // if (!pr.mergeable) {
  //   console.log('Merge conflict - Please merge the Pull Request manually.')
  //   return;
  // }

  // const merge = await octokit.rest.pulls.merge({
  //   owner,
  //   repo,
  //   pull_number: pr.number,
  // });

  // console.log('PR Merged : ', merge);


  const merge = await octokit.rest.repos.merge({
    owner,
    repo,
    head: newBranch,
    base: branch,
  });

  if (merge.status === 409) {
    console.log('Merge conflict')
  }

  console.log ('MERGE : ', merge);

  // TODO: deletePR && deleteRef
};

export default {
  saveFile,
  fetchFile
}