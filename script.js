import { Octokit } from "octokit";
import fs from "fs/promises";
import dotenv from "dotenv";
dotenv.config();

/**
 * @typedef RepoInfo
 * @property {string} owner
 * @property {string} repo
 * @property {number} stars
 * @property {Array<PRInfo>} prs
 **/

/**
 * @typedef PRInfo
 * @property {"open"|"closed"} state
 * @property {boolean} isMerged
 * @property {string} repo_url
 **/

const DEBUG = false;

const octokit = new Octokit({
    auth: process.env.AUTH_TOKEN,
});

async function getPRs() {
    /**
     * @type {Array<PRInfo>}
     */
    let prs = [];
    if (!DEBUG) {
        prs = (
            await octokit.paginate("GET /search/issues", {
                q: "is:pr+author:guilhas07",
                per_page: 100,
            })
        ).map((el) => {
            return {
                state: /** @type {"open"| "closed"} */ (el["state"]),
                isMerged: (el["pull_request"]?.["merged_at"] ?? null) !== null,
                repo_url: el["repository_url"],
            };
        });
    } else {
        prs = JSON.parse((await fs.readFile("giro.json")).toString());
    }
    return prs;
}

/**
 * @param {Array<PRInfo>} prs
 * @returns {Promise<Array<RepoInfo>>}
 **/
async function getSortedReposByStars(prs) {
    /**
     * @type Map<string, RepoInfo>
     **/
    const reposMap = new Map();
    let openPRCount = 0;

    /**
     * @type Array<RepoInfo>
     **/
    const repos = [];
    for (let pr of prs) {
        const url = /https:\/\/api.github.com\/repos\/([^\/]+)\/([^\/]+)/.exec(
            pr.repo_url,
        );

        if (url === null) {
            process.exitCode = 1;
            process.exit(`Error: Couldn't parse repo url: ${pr.repo_url}`);
        }

        let owner = url[1],
            repo = url[2];

        if (pr.state == "closed" && !pr.isMerged) continue;

        if (pr.state == "open") openPRCount++;

        const key = `${owner}/${repo}`;
        if (reposMap.has(key)) {
            /** @type {RepoInfo} */ (reposMap.get(key)).prs.push(pr);
            continue;
        }

        /**
         * @type {RepoInfo}
         */
        const repoInfo = {
            owner: owner,
            repo: repo,
            stars: await getRepoStars(owner, repo),
            prs: [pr],
        };
        reposMap.set(key, repoInfo);
        repos.push(repoInfo);
    }

    repos.sort((el1, el2) => el1.stars - el2.stars);
    return repos;
}

/**
    @param {string} owner
    @param {string} repo
    @returns number
*/
async function getRepoStars(owner, repo) {
    return (
        await octokit.request("GET /repos/{owner}/{repo}", {
            owner: owner,
            repo: repo,
        })
    ).data["stargazers_count"];
}

/**
 *  @param {Array<RepoInfo>} repos
 *  @returns string
 */
function generateContributionsSection(repos) {
    let content = `
### 🚀 Open Source Contributions

<p align="center">`;
    for (const r of repos.reverse()) {
        let found = false;
        for (const pr of r.prs) {
            if (pr.isMerged) {
                found = true;
                break;
            }
        }
        if (!found) continue;
        content += `
    <a href="https://github.com/${r.owner}/${r.repo}/pulls?q=is%3Apr+author%3Aguilhas07" target="_blank">
        <img width=300 height=150 src="https://github-readme-stats.vercel.app/api/pin/?username=${r.owner}&repo=${r.repo}&theme=radical&show_owner=true" />            
    </a>`;
    }
    content += `
</p>`;
    return content;
}

/**
 * @param {string} readme
 * @param {Array<PRInfo>} prs
 * @returns {string}
 **/
function addOpenPRbadge(readme, prs) {
    let openPRCount = 0;
    for (let pr of prs) {
        if (pr.state == "open") openPRCount++;
    }
    return readme.replace("${OPEN_PRS}", `${openPRCount}`);
}

(async function main() {
    let readme = (await fs.readFile("template.md")).toString();
    let prs = await getPRs();
    readme = addOpenPRbadge(readme, prs);

    //readme += generateContributionsSection(sortedRepos);
    await fs.writeFile("README.md", readme);
})();
