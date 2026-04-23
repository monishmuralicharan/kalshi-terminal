Run on startup for redis streams (news-raw, news-enriched):

docker run -d \
  --name redis-dev \
  -p 6379:6379 \
  redis:7