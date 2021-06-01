const { Octokit, App, Action } = require("@octokit/rest");
const { createAppAuth } = require("@octokit/auth-app");
const { basename } = require('path');

const owner = '<%= options.owner %>';
const repo = '<%= options.repo %>';
const defaultBranch = '<%= options.branch %>';

const dbPath = '<%= options.dbPath %>';

const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: '<%= options.appId %>',
    privateKey: `<%= options.privateKey %>`,
    installationId: '<%= options.installationId %>'
  },
});


/**
 * Fetch @filePath last update datetime from database json
 * @param {String} filePath
 * @returns {Date} updatedAt
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


/**
 * Get branches filtered by @branchNameRegex from github repository
 * @param {RegExp} branchNameRegex
 * @returns {Array} branches
 */
const branchExists = async (branchNameRegex) => {

  const { data: branches } = await octokit.rest.repos.listBranches({
    owner,
    repo,
  });

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
  let branch = defaultBranch;

  // disable response cache
  octokit.rest.repos.getContent.endpoint.defaults({ headers: { 'Cache-Control': 'no-cache' } });


  // TODO: show other authors editing same file (if any)
  const userBranch = await branchExists(
    new RegExp(`content/${author}/${Buffer.from(filePath).toString('base64')}/` + '([0-9]+)')
  );
  if (userBranch) {
    branch = userBranch.name
    console.log('[-] FETCHING CONTENT FROM USER BRANCH : ', userBranch.name)
  }


  const { data: { content, encoding } } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref: `heads/${branch}`,
  });

  return {
    editBranch: branch,
    content: (new Buffer(content, encoding)).toString('utf-8')
  };
}

/**
 * Save @author's changes ( @content ) to @filePath on github's @editBranch
 *
 * @param {Object} args
 * @param {String} args.filePath
 * @param {String} args.content
 * @param {String} args.author
 * @param {String} args.editBranch
 * @returns
 */
const editFile = async ({filePath, content, author, editBranch}) => {

  console.log(await octokit.rest.apps.getAuthenticated());

  const { data: { object: { sha: currCommitSha }} } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${editBranch}`,
  });

  const { data: { tree: { sha: treeSha } } } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: currCommitSha,
  });

  /* Create Branch */
  if (editBranch === defaultBranch) {

    const newBranch = `content/${author}/${Buffer.from(filePath).toString('base64')}/${Date.now()}`

    const ref = await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${newBranch}`,
      sha: currCommitSha,
    });

    console.log('[-] User branch created: ', ref);

    editBranch = newBranch;
  }

  /* Commit Changes */
  const { data: { sha: blobSha, url } } = await octokit.git.createBlob({
    owner,
    repo,
    content,
    encoding: 'utf-8',
  });
  const tree = [{sha: blobSha, path: filePath}].map(({ sha, path }, index) => ({
    path,
    mode: `100644`,
    type: `blob`,
    sha: blobSha,
  }));
  const { data: { sha: newTreeSha } } = await octokit.git.createTree({
    owner,
    repo,
    tree,
    base_tree: treeSha,
  });
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message: 'Octo Commit !',
    tree: newTreeSha,
    parents: [currCommitSha],
  });
  console.log('[-] Commit :', newCommit);

  /* Push Changes */
  const updateRef = await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${editBranch}`,
    sha: newCommit.sha,
  })

  console.log('[-] Edit Saved ✓');

  return { editBranch };
};


/**
 * Redeploy static website with file changes.
 * @editBranch merge -> github actions -> nuxt generate
 *
 * @param {Object} args
 * @param {String} args.filePath
 * @param {String} args.editBranch - Github Branch containing user edits
 */
const publishChanges = async ({ filePath, editBranch }) => {

  const latestFileVersion = await latestVersion(filePath);
  console.log('[-] Latest public changes : ', latestFileVersion);

  if (!editBranch || editBranch === defaultBranch) {
    console.warn('/!\\ Please update file content before saving. /!\\')
    return;
  }

  const [, editVersion] = editBranch.match(new RegExp(`content/.*/.*/` + '([0-9]+)'))
  console.log('[-] First unpublished changes (user branch creation date) on : ', new Date(editVersion * 1000));


  if (latestFileVersion >= new Date(editVersion * 1000)) {
    console.warn('/!\\ Conflicting changes were published by ... /!\\'); //TODO
    return ;
  }

  const merge = await octokit.rest.repos.merge({
    owner,
    repo,
    head: editBranch,
    base: defaultBranch,
  });

  if (merge.status === 409) {
    console.log('Merge conflict')
  }

  console.log ('[-] Publishing file changes (Branch Merged)', merge);

  /* Delete Merged Branch */
  await octokit.rest.git.deleteRef({
    owner,
    repo,
    ref: `refs/heads/${editBranch}`,
  });
};

export default {
  fetchFile,
  editFile,
  publishChanges,
};