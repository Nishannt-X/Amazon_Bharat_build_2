FROM 873166718544.dkr.ecr.ap-southeast-2.amazonaws.com/floodflow-cv:20261012-005725
USER root
COPY scripts/cv/ /app/scripts/cv/
RUN chown -R cv:cv /app/scripts/cv
USER cv
EXPOSE 8080
CMD ["python", "scripts/cv/service.py"]
