#!/bin/sh
 ORG="mapbots"
REPO="get-strat-data"
NAME="datamoon"
MAIL="d@a.moon"
 MSG="persevere"
DATE="01 Jan 2032 00:00:00 +0000"
GIT_TOKEN=`cat "secret-git-token-$NAME"`
GIT_HISTORY_VIEW_LENGTH="2"


function title() {
  echo -e "\n--- $1:"
}

function pause() {
  read -s -n 1 -p "Press any key to continue . . ."
  echo -e "\n"
}

function titleAndPause() {
  title "(Pausing before $2)"
  pause
  title "$1"
}


if [[ $1 = "init" ]]; then
  title "Initializing Git repo"
  git init
  git remote add origin git@github.com:$ORG/$REPO.git
  git remote set-url origin https://$GIT_TOKEN@github.com/$ORG/$REPO.git
  echo "Set remote to https://`echo "$GIT_TOKEN" | cut -c1-8`...@github.com/$ORG/$REPO.git"
  echo ""
fi


title "Staging changes"
git add --all
git status


titleAndPause "Committing" "commit"
   GIT_AUTHOR_DATE="$DATE" \
GIT_COMMITTER_DATE="$DATE" \
   GIT_AUTHOR_NAME="$NAME"    GIT_AUTHOR_EMAIL="$MAIL" \
GIT_COMMITTER_NAME="$NAME" GIT_COMMITTER_EMAIL="$MAIL" \
git \
commit --date="$DATE" --author="$NAME <$MAIL>" -m "$MSG"


title "Git history"
git log  -n $GIT_HISTORY_VIEW_LENGTH --pretty=fuller
echo ""


titleAndPause "Uploading as user $NAME" "uploading"
git push -u origin master
