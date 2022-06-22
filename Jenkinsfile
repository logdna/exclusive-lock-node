library 'magic-butler-catalogue'

def PROJECT_NAME = "exclusive-lock"
def CURRENT_BRANCH = [env.CHANGE_BRANCH, env.BRANCH_NAME]?.find{branch -> branch != null}
def DEFAULT_BRANCH = 'main'
def TRIGGER_PATTERN = ".*@logdnabot.*"

pipeline {
  agent {label 'ec2-fleet'}

  options {
    timestamps()
    timeout time: 1, unit: 'HOURS'
    ansiColor 'xterm'
  }

  triggers {
    issueCommentTrigger(TRIGGER_PATTERN)
  }

  environment {
    GITHUB_TOKEN = credentials('github-api-token')
    NPM_CONFIG_CACHE = '.npm'
    NPM_CONFIG_USERCONFIG = '.npmrc'
    SPAWN_WRAP_SHIM_ROOT = '.npm'
  }

  stages {
    stage('Validate PR Source') {
      when {
        expression { env.CHANGE_FORK }
        not {
          triggeredBy 'issueCommentCause'
        }
      }
      steps {
        error("A maintainer needs to approve this PR for CI by commenting")
      }
    }

    stage('Test Suite') {
      when {
        beforeAgent true
        not {
          changelog '\\[skip ci\\]'
        }
      }

      agent {
        node {
          label 'ec2-fleet'
          customWorkspace "${PROJECT_NAME}-${BUILD_NUMBER}"
        }
      }

      steps {
        sh "mkdir -p ${NPM_CONFIG_CACHE}"
        sh 'mkdir -p coverage'
        script {
          compose.up(
            PROJECT_NAME
          , ['compose/base.yml', 'compose/test.yml']
          , [build: true]
          , BUILD_TAG
          )
        }
      }

      post {
        always {
          script {
            compose.down(
              ['compose/base.yml', 'compose/test.yml']
            , [('remove-orphans'): true, ('volumes'): true, ('rmi'): 'local']
            , BUILD_TAG
            )
          }

          junit(
            testResults: 'coverage/test.xml'
          , checksName: "Test Suite"
          )
          stash(
            name: slugify(BUILD_TAG)
          , allowEmpty: true
          , includes: 'coverage/*.json'
          )
          publishHTML target: [
            allowMissing: false,
            alwaysLinkToLastBuild: false,
            keepAll: true,
            reportDir: 'coverage/lcov-report',
            reportFiles: 'index.html',
            reportName: "coverage"
          ]
        }
      }
    }

    stage('Test Release') {
      when {
        beforeAgent true
        not {
          branch DEFAULT_BRANCH
        }
      }

      agent {
        node {
          label 'ec2-fleet'
          customWorkspace "${PROJECT_NAME}-${BUILD_NUMBER}"
        }
      }

      tools {
        nodejs 'NodeJS 14'
      }

      environment {
        GIT_BRANCH = "${CURRENT_BRANCH}"
        BRANCH_NAME = "${CURRENT_BRANCH}"
        CHANGE_ID = ""
        NPM_TOKEN = credentials('npm-publish-token')
      }

      steps {
        script {
          sh "mkdir -p ${NPM_CONFIG_CACHE}"
          sh 'npm install'
          sh "npm run release:dry"
        }
      }
    }

    stage('Release') {
      when {
        beforeAgent true
        branch DEFAULT_BRANCH
        not {
          changelog '\\[skip ci\\]'
        }
      }

      agent {
        node {
          label 'ec2-fleet'
          customWorkspace "${PROJECT_NAME}-${BUILD_NUMBER}"
        }
      }

      tools {
        nodejs 'NodeJS 14'
      }

      environment {
        GIT_BRANCH = "${CURRENT_BRANCH}"
        BRANCH_NAME = "${CURRENT_BRANCH}"
        CHANGE_ID = ""
        NPM_TOKEN = credentials('npm-publish-token')
      }

      steps {
        script {
          sh "mkdir -p ${NPM_CONFIG_CACHE}"
          sh 'npm install'
          sh 'npm run release'
        }
      }
    }
  }
}
