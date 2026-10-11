FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.lock.txt .
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY services services
COPY migrations migrations
COPY alembic.ini .
COPY infra/start-service.sh /start-service.sh
RUN useradd --create-home app && chown -R app:app /app && chmod +x /start-service.sh
USER app
CMD ["/start-service.sh"]
