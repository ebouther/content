const { Octokit, App, Action } = require("@octokit/rest");
const { createAppAuth } = require("@octokit/auth-app");
const { uuid } = require('uuidv4');
const { basename } = require('path');

const owner = '<%= options.owner %>';
const repo = '<%= options.repo %>';
const branch = '<%= options.branch %>';

const dbPath = '<%= options.dbPath %>';

const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: '<%= options.appId %>',
    privateKey: `<%= options.privateKey %>`,
    installationId: '<%= options.installationId %>'
  },
});

console.log('OCTO :: ', octokit);

/**
 * Get latest version timestamp of @filePath from database json
 */
const latestVersion = async (filePath) => {
  const db = JSON.parse(await (await fetch(`${dbPath}/db.json`.replace('\/\/', '\/'))).text());

  const slug = basename(filePath).replace(/\.[^/.]+$/, '')

  return db._collections
    .find(c => c.name === 'items')
    ._data
    .find(i => i.slug === slug) // TODO: dir + slug check?
    .updatedAt
}

const branchExists = async (branchNameRegex) => {

  const { data: branches } = await octokit.rest.repos.listBranches({
    owner,
    repo,
  });
  console.log('BRANCHES : ', branches);

  return branches.find( b => b.name.match(branchNameRegex) );
}

/**
 * Fetch @filePath content from github repository
 *
 * @param {String} filePath
 * @param {String} author
 * @returns {String} File Content
 */
const fetchFile = async ({ filePath, author }) => {
  let editBranch = branch;

  // disable response cache
  octokit.rest.repos.getContent.endpoint.defaults({ headers: { 'Cache-Control': 'no-cache' } });


  const userBranch = await branchExists(
    new RegExp(`content/${author}/${Buffer.from(filePath).toString('base64')}/` + '([0-9]+)')
  );
  if (userBranch) {
    editBranch = userBranch.name
    console.log('FETCHING CONTENT FROM USER BRANCH : ', userBranch.name)
  }


  const { data: { content, encoding } } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref: `heads/${editBranch}`,
  });

  return {
    editBranch,
    content: (new Buffer(content, encoding)).toString('utf-8')
  };
}

/* Github update of @filePath with @content */
const updateFile = async ({filePath, content, author, editBranch}) => {

  console.log(await octokit.rest.apps.getAuthenticated());

  const { data: { object: { sha: currCommitSha }} } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${editBranch}`,
  });
  console.log('commit sha: ', currCommitSha);

  const { data: { tree: { sha: treeSha } } } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: currCommitSha,
  });
  console.log('tree sha: ', treeSha);

  /* Create Branch */
  if (editBranch === branch) {

    const newBranch = `content/${author}/${Buffer.from(filePath).toString('base64')}/${Date.now()}`

    const ref = await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${newBranch}`,
      sha: currCommitSha,
    });

    editBranch = newBranch;
  }



  /* Create Blob */
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
  console.log('tree: ', tree);

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
    ref: `heads/${editBranch}`,
    sha: newCommit.sha,
  })

  console.log('UPDATE REF :', updateRef);

  return { editBranch };
};

const saveFile = async ({ filePath, editBranch }) => {

  const latestFileVersion = await latestVersion(filePath);
  console.log('LATEST FILE CHANGES : ', latestFileVersion);

  if (!editBranch || editBranch === branch) {
    console.warn('Please update file content before saving.')
    return;
  }

  const [, editVersion] = editBranch.match(new RegExp(`content/.*/.*/` + '([0-9]+)'))
  console.log('EDIT VERSION : ', editVersion, new Date(editVersion * 1000));


  if (latestFileVersion >= new Date(editVersion * 1000)) {
    console.warn('File has been updated by ... ');
    return ;
  }


  const merge = await octokit.rest.repos.merge({
    owner,
    repo,
    head: editBranch,
    base: branch,
  });

  if (merge.status === 409) {
    console.log('Merge conflict')
  }

  console.log ('MERGED : ', merge);
};

export default {
  fetchFile,
  updateFile,
  saveFile,
};